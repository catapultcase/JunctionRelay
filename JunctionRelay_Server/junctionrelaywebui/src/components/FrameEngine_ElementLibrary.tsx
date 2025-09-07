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
    // BarChart as ChartIcon,
    // Image as ImageIcon,
    // ViewModule as ContainerIcon,
} from '@mui/icons-material';
import { FrameEngine_ElementProperties } from './FrameEngine_ElementProperties';

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
        new Set(['basic', 'position', 'appearance', 'dimensions', 'background', 'sensor', 'sensorTypography', 'text'])
    );

    // Auto-switch to properties tab when elements are selected
    useEffect(() => {
        if (selectedElementsData.length > 0) {
            setActiveTab('properties');
        }
    }, [selectedElementsData.length]);

    // Toggle section expansion
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

    // Elements list - only sensor and text elements enabled
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
                <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1.1rem', mb: 1 }}>
                    Element Library & Properties
                </Typography>

                {/* Tab Buttons */}
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

            {/* Tab Content */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                minHeight: 0
            }}>
                {activeTab === 'library' ? (
                    <>
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

                        {/* Elements List */}
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
            </div>
        </Box>
    );
};

export default FrameEngine_ElementLibrary;