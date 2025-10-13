// components/ActiveCollectorsCard.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
    Box,
    Typography,
    Paper,
    Chip,
    Alert,
    Card,
    CardContent,
    CardHeader,
    Collapse,
    IconButton,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Checkbox,
    ListItemText,
    SelectChangeEvent,
    Button,
    Tooltip,
    Slider
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SettingsIcon from '@mui/icons-material/Settings';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import DeselectIcon from '@mui/icons-material/Deselect';
import StorageIcon from '@mui/icons-material/Storage';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import { useDashboardWebSocket } from '../../hooks/useDashboardWebSocket';
import ECGCollectorVisualization from './Dashboard_ECGCollectorVisualization';

interface ActiveCollectorsCardProps {
    defaultExpanded?: boolean;
    storageKey?: string;
}

const ActiveCollectorsCard: React.FC<ActiveCollectorsCardProps> = ({
    defaultExpanded = true,
    storageKey = 'active_collectors_expanded'
}) => {
    const [expanded, setExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem(storageKey);
        return saved !== null ? saved === 'true' : defaultExpanded;
    });

    const [showCollectorSelect, setShowCollectorSelect] = useState<boolean>(false);

    // Track which collectors should be displayed
    const [selectedCollectors, setSelectedCollectors] = useState<string[]>(() => {
        const saved = localStorage.getItem(`${storageKey}_selected`);
        return saved ? JSON.parse(saved) : [];
    });

    // NEW: ECG width control with localStorage persistence
    const [ecgWidth, setEcgWidth] = useState<number>(() => {
        const saved = localStorage.getItem(`${storageKey}_ecg_width`);
        return saved ? parseInt(saved, 10) : 400; // Default to current size
    });

    // Only use WebSocket hook when expanded
    const {
        collectors,
        connectionStatus,
        isConnected,
        lastUpdate,
        disconnect,
        connect
    } = useDashboardWebSocket({
        enabled: expanded
    });

    // Get unique collector identifiers
    const availableCollectors = useMemo(() => {
        return collectors.map(collector => ({
            key: collector.sourceKey || collector.id || `collector-${collectors.indexOf(collector)}`,
            name: collector.name || collector.sourceKey || `Collector ${collectors.indexOf(collector) + 1}`,
            collector
        }));
    }, [collectors]);

    // Auto-select new collectors when they appear
    useEffect(() => {
        if (availableCollectors.length > 0) {
            setSelectedCollectors(prev => {
                const currentKeys = availableCollectors.map(c => c.key);

                // If this is the first time seeing collectors, select all
                if (prev.length === 0) {
                    return currentKeys;
                }

                // Add any new collectors that aren't in our selection
                const newKeys = currentKeys.filter(key => !prev.includes(key));
                if (newKeys.length > 0) {
                    return [...prev, ...newKeys];
                }

                // Remove any collectors that no longer exist
                return prev.filter(key => currentKeys.includes(key));
            });
        }
    }, [availableCollectors]);

    // Save expansion state
    useEffect(() => {
        localStorage.setItem(storageKey, expanded.toString());
    }, [expanded, storageKey]);

    // Save selected collectors
    useEffect(() => {
        localStorage.setItem(`${storageKey}_selected`, JSON.stringify(selectedCollectors));
    }, [selectedCollectors, storageKey]);

    // NEW: Save ECG width to localStorage
    useEffect(() => {
        localStorage.setItem(`${storageKey}_ecg_width`, ecgWidth.toString());
    }, [ecgWidth, storageKey]);

    // Handle WebSocket connection based on expansion state
    useEffect(() => {
        if (expanded) {
            if (!isConnected && typeof connect === 'function') {
                connect();
            }
        }
        // Removed the disconnect when collapsed - let it stay connected
        // Only disconnect on component unmount
    }, [expanded, isConnected, connect]);

    // Separate effect for unmount cleanup only
    useEffect(() => {
        return () => {
            if (typeof disconnect === 'function') {
                disconnect();
            }
        };
    }, [disconnect]);

    const handleToggle = () => {
        setExpanded(!expanded);
        // Close collector selection when collapsing the card
        if (expanded) {
            setShowCollectorSelect(false);
        }
    };

    const handleCollectorSelectToggle = (event: React.MouseEvent) => {
        event.stopPropagation(); // Prevent triggering the card collapse
        setShowCollectorSelect(!showCollectorSelect);
    };

    const handleCollectorSelectionChange = (event: SelectChangeEvent<string[]>) => {
        const value = event.target.value;
        setSelectedCollectors(typeof value === 'string' ? value.split(',') : value);
    };

    const handleSelectAll = () => {
        setSelectedCollectors(availableCollectors.map(c => c.key));
    };

    const handleDeselectAll = () => {
        setSelectedCollectors([]);
    };

    // NEW: Handle ECG width change
    const handleEcgWidthChange = (event: Event, newValue: number | number[]) => {
        setEcgWidth(newValue as number);
    };

    // Filter collectors based on selection
    const displayedCollectors = useMemo(() => {
        return availableCollectors.filter(item => selectedCollectors.includes(item.key));
    }, [availableCollectors, selectedCollectors]);

    const renderCollectorSelect = () => (
        <Box>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Display Collectors</InputLabel>
                <Select
                    multiple
                    value={selectedCollectors}
                    onChange={handleCollectorSelectionChange}
                    label="Display Collectors"
                    MenuProps={{
                        PaperProps: {
                            style: {
                                maxHeight: 300
                            }
                        }
                    }}
                    renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {selected.map((key) => {
                                const collector = availableCollectors.find(c => c.key === key);
                                return (
                                    <Chip
                                        key={key}
                                        label={collector?.name || key}
                                        size="small"
                                    />
                                );
                            })}
                        </Box>
                    )}
                >
                    {availableCollectors.map((item) => (
                        <MenuItem key={item.key} value={item.key}>
                            <Checkbox checked={selectedCollectors.includes(item.key)} />
                            <ListItemText primary={item.name} />
                        </MenuItem>
                    ))}
                </Select>

                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button
                        size="small"
                        onClick={handleSelectAll}
                        startIcon={<SelectAllIcon />}
                        disabled={selectedCollectors.length === availableCollectors.length}
                    >
                        Select All
                    </Button>
                    <Button
                        size="small"
                        onClick={handleDeselectAll}
                        startIcon={<DeselectIcon />}
                        disabled={selectedCollectors.length === 0}
                    >
                        Deselect All
                    </Button>
                </Box>
            </FormControl>

            {/* NEW: ECG Width Control */}
            <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <AspectRatioIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle2">
                        ECG Width: {ecgWidth}px
                    </Typography>
                </Box>
                <Box sx={{ px: 2, maxWidth: 300 }}>
                    <Slider
                        value={ecgWidth}
                        onChange={handleEcgWidthChange}
                        min={200}
                        max={800}
                        step={50}
                        marks={[
                            { value: 200, label: '200' },
                            { value: 400, label: '400' },
                            { value: 600, label: '600' },
                            { value: 800, label: '800' }
                        ]}
                        size="small"
                        sx={{ mb: 1 }}
                    />
                </Box>
                <Typography variant="caption" color="text.secondary">
                    Adjust visualization width (saved automatically)
                </Typography>
            </Box>
        </Box>
    );

    return (
        <Card sx={{ mb: 4, borderRadius: 2 }}>
            <CardHeader
                title={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <StorageIcon color="primary" />
                        <Typography variant="h6">
                            Active Collectors
                        </Typography>
                        {expanded && (
                            <>
                                <Chip
                                    label={connectionStatus}
                                    color={isConnected ? 'success' : 'error'}
                                    size="small"
                                />
                                {availableCollectors.length > 0 && (
                                    <Chip
                                        label={`${displayedCollectors.length}/${availableCollectors.length} shown`}
                                        size="small"
                                        variant="outlined"
                                    />
                                )}
                                {/* NEW: Width indicator chip */}
                                {displayedCollectors.length > 0 && (
                                    <Chip
                                        label={`${ecgWidth}px wide`}
                                        size="small"
                                        variant="outlined"
                                        color="secondary"
                                    />
                                )}
                            </>
                        )}
                    </Box>
                }
                action={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {expanded && (
                            <Tooltip title="Collector Settings">
                                <IconButton
                                    onClick={handleCollectorSelectToggle}
                                    size="small"
                                    color={showCollectorSelect ? 'primary' : 'default'}
                                >
                                    <SettingsIcon />
                                </IconButton>
                            </Tooltip>
                        )}
                        <IconButton onClick={handleToggle} size="small">
                            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                    </Box>
                }
                sx={{
                    cursor: 'pointer',
                    pb: expanded ? 1 : 2,
                    '&:hover': { backgroundColor: 'action.hover' }
                }}
                onClick={handleToggle}
            />

            <Collapse in={expanded}>
                {expanded && (
                    <CardContent sx={{ pt: 0 }}>
                        {!isConnected && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                WebSocket not connected. Connection status: {connectionStatus}
                            </Alert>
                        )}

                        {/* Collector Selection Panel */}
                        <Collapse in={showCollectorSelect}>
                            {showCollectorSelect && (
                                <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                                    <Typography variant="subtitle2" gutterBottom>
                                        Collector Display Settings
                                    </Typography>
                                    {renderCollectorSelect()}
                                </Paper>
                            )}
                        </Collapse>

                        {availableCollectors.length === 0 ? (
                            <Paper sx={{ p: 3, textAlign: 'center' }}>
                                <Typography color="text.secondary">
                                    {isConnected ? 'No active collectors found' : 'Waiting for connection...'}
                                </Typography>
                            </Paper>
                        ) : displayedCollectors.length === 0 ? (
                            <Paper sx={{ p: 3, textAlign: 'center' }}>
                                <Typography color="text.secondary">
                                    No collectors selected for display. Use the settings to select collectors.
                                </Typography>
                                <Button
                                    onClick={handleSelectAll}
                                    sx={{ mt: 1 }}
                                    startIcon={<SelectAllIcon />}
                                >
                                    Show All Collectors
                                </Button>
                            </Paper>
                        ) : (
                            <Box sx={{
                                display: 'grid',
                                gap: 2,
                                gridTemplateColumns: `repeat(auto-fit, ${ecgWidth}px)`, // Dynamic grid based on width
                                width: '100%'
                            }}>
                                {displayedCollectors.map((item) => (
                                    <ECGCollectorVisualization
                                        key={item.key}
                                        collector={item.collector}
                                        width={ecgWidth} // Use dynamic width
                                        height={120}
                                    />
                                ))}
                            </Box>
                        )}
                    </CardContent>
                )}
            </Collapse>
        </Card>
    );
};

export default ActiveCollectorsCard;