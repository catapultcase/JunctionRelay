import React, { useState, useCallback } from 'react';
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
    BarChart as ChartIcon,
    Image as ImageIcon,
    ViewModule as ContainerIcon,
} from '@mui/icons-material';

interface PlacedElement {
    id: string;
    type: 'sensor' | 'text' | 'chart' | 'image' | 'container';
    x: number;
    y: number;
    width: number;
    height: number;
    properties: Record<string, any>;
    sensorId?: string;
}

interface ElementTemplate {
    id: string;
    name: string;
    description: string;
    type: PlacedElement['type'];
    icon: React.ReactNode;
    defaultWidth: number;
    defaultHeight: number;
    defaultProperties: Record<string, any>;
    category: 'basic' | 'data' | 'media' | 'layout';
}

interface ElementLibraryProps {
    // Keep these two props only; parent should pass these
    selectedElements: string[];
    onElementAdd: (element: Omit<PlacedElement, 'id'>) => void;
}

const FrameEngine_ElementLibrary: React.FC<ElementLibraryProps> = ({
    selectedElements, // kept for parity; not used here
    onElementAdd,
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    // Elements list ONLY (no tabs). Sensor stays as a regular element template.
    const elementTemplates: ElementTemplate[] = [
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
                backgroundColor: '#e3f2fd',
                textColor: '#000000',
                textAlign: 'left',
            },
            category: 'data',
        },
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
            id: 'chart-widget',
            name: 'Chart Widget',
            description: 'Data visualization chart',
            type: 'chart',
            icon: <ChartIcon />,
            defaultWidth: 200,
            defaultHeight: 120,
            defaultProperties: {
                chartType: 'line',
                title: 'Chart',
                showLegend: true,
                showGrid: true,
                backgroundColor: '#ffffff',
                borderColor: '#cccccc',
                fontSize: 12,
            },
            category: 'data',
        },
        {
            id: 'image-widget',
            name: 'Image',
            description: 'Static image or logo',
            type: 'image',
            icon: <ImageIcon />,
            defaultWidth: 100,
            defaultHeight: 80,
            defaultProperties: {
                imageUrl: '',
                alt: 'Image',
                fit: 'cover',
                borderRadius: 0,
            },
            category: 'media',
        },
        {
            id: 'container-widget',
            name: 'Container',
            description: 'Group elements together',
            type: 'container',
            icon: <ContainerIcon />,
            defaultWidth: 200,
            defaultHeight: 100,
            defaultProperties: {
                title: 'Container',
                backgroundColor: '#f5f5f5',
                borderColor: '#cccccc',
                borderWidth: 1,
                padding: 10,
            },
            category: 'layout',
        },
    ];

    // Drag start for element templates
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

    // Quick add element (double-click)
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

    // Filter + group by category
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
    };

    return (
        <Box
            sx={{
                width: 320,
                flex: 1,
                bgcolor: 'background.paper',
                borderLeft: 1,
                borderColor: 'divider',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/* Header */}
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem' }}>
                    Element Library
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Drag to canvas or double-click to add
                </Typography>
            </Box>

            {/* Search */}
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

            {/* Elements List (no tabs) */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                <Box sx={{ p: 1.5, height: '100%', overflow: 'auto' }}>
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
            </Box>

            {/* Footer */}
            <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        💡 Tip:
                    </Typography>
                    <Typography variant="caption" color="text.disabled">
                        Drag or double-click
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
};

export default FrameEngine_ElementLibrary;
