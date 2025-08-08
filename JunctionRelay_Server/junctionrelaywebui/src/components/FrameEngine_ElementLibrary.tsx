import React, { useState, useCallback } from 'react';
import {
    Box,
    Typography,
    Tabs,
    Tab,
    TextField,
    InputAdornment,
    Card,
    CardContent,
    Chip,
    Button,
    IconButton,
    Divider,
    Tooltip,
    CircularProgress,
    Alert,
} from '@mui/material';
import {
    Search as SearchIcon,
    Refresh as RefreshIcon,
    DragIndicator as DragIcon,
    Sensors as SensorsIcon,
    TextFields as TextIcon,
    BarChart as ChartIcon,
    Image as ImageIcon,
    ViewModule as ContainerIcon,
    Circle as CircleIcon,
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

interface AvailableSensor {
    id: string;
    name: string;
    value: string;
    unit: string;
    type: 'environmental' | 'system' | 'custom';
    isOnline: boolean;
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
    availableSensors: AvailableSensor[];
    selectedElements: string[];
    onElementAdd: (element: Omit<PlacedElement, 'id'>) => void;
    onRefreshSensors: () => void;
}

// Custom tab panel component
interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`element-library-tabpanel-${index}`}
            aria-labelledby={`element-library-tab-${index}`}
            {...other}
            style={{ height: '100%', overflow: 'hidden' }}
        >
            {value === index && children}
        </div>
    );
}

const FrameEngine_ElementLibrary: React.FC<ElementLibraryProps> = ({
    availableSensors,
    selectedElements,
    onElementAdd,
    onRefreshSensors,
}) => {
    const [activeTab, setActiveTab] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Element templates with Material-UI icons
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
                unit: '',
                fontSize: 12,
                showUnit: true,
                backgroundColor: '#e3f2fd',
                textColor: '#000000'
            },
            category: 'data'
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
                backgroundColor: 'transparent'
            },
            category: 'basic'
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
                borderColor: '#cccccc'
            },
            category: 'data'
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
                borderRadius: 0
            },
            category: 'media'
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
                padding: 10
            },
            category: 'layout'
        }
    ];

    // Handle drag start for element templates
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

    // Handle drag start for sensors
    const handleSensorDragStart = useCallback((sensor: AvailableSensor, event: React.DragEvent) => {
        const elementData = {
            type: 'sensor' as const,
            width: 120,
            height: 60,
            properties: {
                sensorName: sensor.name,
                sensorId: sensor.id,
                unit: sensor.unit,
                fontSize: 12,
                showUnit: true,
                backgroundColor: sensor.type === 'environmental' ? '#e8f5e8' : '#f0f8ff',
                textColor: '#000000'
            },
            x: 0,
            y: 0,
        };

        event.dataTransfer.setData('application/x-element-type', 'sensor');
        event.dataTransfer.setData('application/x-element-data', JSON.stringify(elementData));
        event.dataTransfer.effectAllowed = 'copy';
    }, []);

    // Quick add element (double-click alternative)
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

    // Quick add sensor
    const handleQuickAddSensor = useCallback((sensor: AvailableSensor) => {
        onElementAdd({
            type: 'sensor',
            x: 50,
            y: 50,
            width: 120,
            height: 60,
            properties: {
                sensorName: sensor.name,
                sensorId: sensor.id,
                unit: sensor.unit,
                fontSize: 12,
                showUnit: true,
                backgroundColor: sensor.type === 'environmental' ? '#e8f5e8' : '#f0f8ff',
                textColor: '#000000'
            },
        });
    }, [onElementAdd]);

    // Handle refresh sensors
    const handleRefreshSensors = useCallback(async () => {
        setIsRefreshing(true);
        try {
            await onRefreshSensors();
        } finally {
            setIsRefreshing(false);
        }
    }, [onRefreshSensors]);

    // Filter elements and sensors based on search
    const filteredTemplates = elementTemplates.filter(template =>
        template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredSensors = availableSensors.filter(sensor =>
        sensor.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sensor.type.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Group templates by category
    const templatesByCategory = filteredTemplates.reduce((acc, template) => {
        if (!acc[template.category]) {
            acc[template.category] = [];
        }
        acc[template.category].push(template);
        return acc;
    }, {} as Record<string, ElementTemplate[]>);

    const categoryNames = {
        basic: 'Basic Elements',
        data: 'Data Elements',
        media: 'Media Elements',
        layout: 'Layout Elements'
    };

    const getSensorTypeColor = (type: string) => {
        switch (type) {
            case 'environmental':
                return 'success';
            case 'system':
                return 'info';
            default:
                return 'default';
        }
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

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                    value={activeTab}
                    onChange={(_, newValue) => setActiveTab(newValue)}
                    variant="fullWidth"
                    textColor="primary"
                    indicatorColor="primary"
                >
                    <Tab
                        label="Elements"
                        sx={{ fontSize: '0.75rem', minHeight: 40, py: 1 }}
                    />
                    <Tab
                        label={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                Sensors
                                <Chip
                                    label={availableSensors.length}
                                    size="small"
                                    color="primary"
                                    sx={{ fontSize: '0.7rem', height: 16 }}
                                />
                            </Box>
                        }
                        sx={{ fontSize: '0.75rem', minHeight: 40, py: 1 }}
                    />
                    <Tab
                        label="Templates"
                        sx={{ fontSize: '0.75rem', minHeight: 40, py: 1 }}
                    />
                </Tabs>
            </Box>

            {/* Search */}
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                <TextField
                    size="small"
                    fullWidth
                    placeholder="Search..."
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

            {/* Content */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {/* Elements Tab */}
                <TabPanel value={activeTab} index={0}>
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
                                        display: 'block'
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
                                                        <Typography
                                                            variant="body2"
                                                            sx={{ fontWeight: 600, fontSize: '0.875rem' }}
                                                        >
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
                </TabPanel>

                {/* Sensors Tab */}
                <TabPanel value={activeTab} index={1}>
                    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Sensors Header */}
                        <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                    Available Sensors
                                </Typography>
                                <Tooltip title="Refresh sensors">
                                    <IconButton
                                        size="small"
                                        onClick={handleRefreshSensors}
                                        disabled={isRefreshing}
                                    >
                                        {isRefreshing ? (
                                            <CircularProgress size={16} />
                                        ) : (
                                            <RefreshIcon fontSize="small" />
                                        )}
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </Box>

                        {/* Sensors List */}
                        <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
                            {filteredSensors.length === 0 ? (
                                <Box sx={{ textAlign: 'center', py: 4 }}>
                                    <SensorsIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                    <Typography variant="body2" color="text.secondary">
                                        No sensors available
                                    </Typography>
                                    <Button
                                        size="small"
                                        onClick={handleRefreshSensors}
                                        startIcon={<RefreshIcon />}
                                        sx={{ mt: 1 }}
                                    >
                                        Try refreshing
                                    </Button>
                                </Box>
                            ) : (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {filteredSensors.map((sensor) => (
                                        <Card
                                            key={sensor.id}
                                            draggable
                                            onDragStart={(e) => handleSensorDragStart(sensor, e)}
                                            onDoubleClick={() => handleQuickAddSensor(sensor)}
                                            sx={{
                                                cursor: 'grab',
                                                transition: 'all 0.2s',
                                                bgcolor: sensor.isOnline ? 'success.light' : 'grey.100',
                                                borderLeft: 4,
                                                borderLeftColor: sensor.isOnline ? 'success.main' : 'grey.400',
                                                '&:hover': {
                                                    transform: 'translateY(-1px)',
                                                    boxShadow: 2,
                                                },
                                                '&:active': {
                                                    cursor: 'grabbing',
                                                },
                                            }}
                                        >
                                            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                    <CircleIcon
                                                        sx={{
                                                            fontSize: 8,
                                                            color: sensor.isOnline ? 'success.main' : 'grey.400',
                                                        }}
                                                    />
                                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                                        <Typography
                                                            variant="body2"
                                                            sx={{ fontWeight: 600, fontSize: '0.875rem' }}
                                                        >
                                                            {sensor.name}
                                                        </Typography>
                                                        <Typography
                                                            variant="caption"
                                                            color="text.secondary"
                                                        >
                                                            {sensor.value} {sensor.unit}
                                                        </Typography>
                                                        <Box sx={{ mt: 0.5 }}>
                                                            <Chip
                                                                label={sensor.type}
                                                                size="small"
                                                                color={getSensorTypeColor(sensor.type) as any}
                                                                sx={{ fontSize: '0.7rem', height: 20 }}
                                                            />
                                                        </Box>
                                                    </Box>
                                                    <DragIcon color="action" fontSize="small" />
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </Box>
                            )}
                        </Box>
                    </Box>
                </TabPanel>

                {/* Templates Tab */}
                <TabPanel value={activeTab} index={2}>
                    <Box sx={{ p: 1.5, textAlign: 'center', py: 8 }}>
                        <Box sx={{ fontSize: 48, mb: 2 }}>🎨</Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Pre-built element templates
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                            Coming soon...
                        </Typography>
                    </Box>
                </TabPanel>
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