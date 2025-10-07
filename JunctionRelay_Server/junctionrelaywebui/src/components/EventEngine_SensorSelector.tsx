/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * JunctionRelay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import React, { useState, useMemo } from "react";
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Box, List, ListItem, ListItemText, ListItemButton,
    Chip, Paper, Typography, ToggleButtonGroup, ToggleButton,
    InputAdornment, FormControl, InputLabel, Select, MenuItem,
    Card, CardContent, SelectChangeEvent
} from "@mui/material";

// Icons
import SearchIcon from '@mui/icons-material/Search';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import FilterListIcon from '@mui/icons-material/FilterList';
import DevicesIcon from '@mui/icons-material/Devices';

interface Sensor {
    id: number;
    name: string;
    value: string;
    unit: string;
    deviceName?: string;
    collectorId?: number;
    deviceId?: number;
    sensorType?: string;
    componentName?: string;
    category?: string;
}

interface EventEngine_SensorSelectorProps {
    open: boolean;
    onClose: () => void;
    onSelect: (sensorId: number) => void;
    sensors: Sensor[];
    selectedSensorId: number | null;
    title: string;
    filterEventSensors?: boolean;
}

const EventEngine_SensorSelector: React.FC<EventEngine_SensorSelectorProps> = ({
    open,
    onClose,
    onSelect,
    sensors,
    selectedSensorId,
    title,
    filterEventSensors = false
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [filterUnit, setFilterUnit] = useState('');
    const [filterSource, setFilterSource] = useState(''); // New: filter by device/collector

    // Group sensors by source (collector/device) and get unique sources
    const { groupedSensors, availableSources } = useMemo(() => {
        let filtered = [...sensors];

        // Apply event sensor filter if needed
        if (filterEventSensors) {
            filtered = filtered.filter(s => s.name.toLowerCase().includes('event'));
        }

        const groups: Record<string, Sensor[]> = {};
        const sources = new Set<string>();

        filtered.forEach(sensor => {
            const key = sensor.deviceName ||
                (sensor.collectorId ? `Collector ${sensor.collectorId}` : '') ||
                'Unknown Source';

            sources.add(key);

            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(sensor);
        });

        return {
            groupedSensors: groups,
            availableSources: Array.from(sources).sort()
        };
    }, [sensors, filterEventSensors]);

    // Get unique units for filter
    const availableUnits = useMemo(() => {
        const units = new Set<string>();
        Object.values(groupedSensors).flat().forEach(s => {
            if (s.unit) units.add(s.unit);
        });
        return Array.from(units).sort();
    }, [groupedSensors]);

    // Filter sensors based on search, unit filter, and source filter
    const filteredSensors = useMemo(() => {
        let result = Object.values(groupedSensors).flat();

        // Apply source filter
        if (filterSource) {
            result = groupedSensors[filterSource] || [];
        }

        // Apply search and unit filters
        result = result.filter(s => {
            const matchesSearch = !searchQuery ||
                s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.componentName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.sensorType?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                s.category?.toLowerCase().includes(searchQuery.toLowerCase());

            const matchesUnit = !filterUnit || s.unit === filterUnit;

            return matchesSearch && matchesUnit;
        });

        return result;
    }, [groupedSensors, searchQuery, filterUnit, filterSource]);

    const handleSelect = (sensorId: number) => {
        onSelect(sensorId);
        onClose();
    };

    const handleClearFilters = () => {
        setSearchQuery('');
        setFilterUnit('');
        setFilterSource('');
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{title}</DialogTitle>

            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    {/* Search and Filters Row */}
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Search by name, component, type, or category..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon />
                                    </InputAdornment>
                                )
                            }}
                            sx={{ flex: 1, minWidth: 250 }}
                        />

                        <FormControl size="small" sx={{ minWidth: 150 }}>
                            <InputLabel>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <FilterListIcon fontSize="small" sx={{ mr: 0.5 }} />
                                    Unit
                                </Box>
                            </InputLabel>
                            <Select
                                value={filterUnit}
                                onChange={(e: SelectChangeEvent) => setFilterUnit(e.target.value)}
                                label="Unit"
                            >
                                <MenuItem value="">
                                    <em>All Units</em>
                                </MenuItem>
                                {availableUnits.map((unit) => (
                                    <MenuItem key={unit} value={unit}>
                                        {unit}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <ToggleButtonGroup
                            value={viewMode}
                            exclusive
                            onChange={(_, newMode) => newMode && setViewMode(newMode)}
                            size="small"
                        >
                            <ToggleButton value="list">
                                <TableViewIcon />
                            </ToggleButton>
                            <ToggleButton value="grid">
                                <ViewModuleIcon />
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Box>

                    {/* Source/Collector Dropdown - Full Width Below */}
                    <FormControl size="small" fullWidth>
                        <InputLabel>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <DevicesIcon fontSize="small" sx={{ mr: 0.5 }} />
                                Source / Collector
                            </Box>
                        </InputLabel>
                        <Select
                            value={filterSource}
                            onChange={(e: SelectChangeEvent) => setFilterSource(e.target.value)}
                            label="Source / Collector"
                        >
                            <MenuItem value="">
                                <em>All Sources</em>
                            </MenuItem>
                            {availableSources.map((source) => (
                                <MenuItem key={source} value={source}>
                                    {source} ({groupedSensors[source]?.length || 0})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {/* Clear Filters Button */}
                    {(searchQuery || filterUnit || filterSource) && (
                        <Button size="small" onClick={handleClearFilters} variant="outlined">
                            Clear Filters
                        </Button>
                    )}

                    {/* Stats */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                            Showing {filteredSensors.length} sensor(s)
                            {(searchQuery || filterUnit || filterSource) &&
                                ` (filtered from ${Object.values(groupedSensors).flat().length} total)`
                            }
                        </Typography>
                        {filterSource && (
                            <Chip
                                label={`Source: ${filterSource}`}
                                size="small"
                                onDelete={() => setFilterSource('')}
                                color="primary"
                            />
                        )}
                    </Box>

                    {/* Sensors Display */}
                    {filteredSensors.length === 0 ? (
                        <Paper sx={{ p: 3, textAlign: 'center' }}>
                            <Typography color="textSecondary">
                                No sensors match your filters
                            </Typography>
                        </Paper>
                    ) : viewMode === 'list' ? (
                        <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                            {filteredSensors.map(sensor => (
                                <ListItem
                                    key={sensor.id}
                                    disablePadding
                                    sx={{
                                        border: '1px solid',
                                        borderColor: sensor.id === selectedSensorId ? 'primary.main' : 'divider',
                                        borderRadius: 1,
                                        mb: 1,
                                    }}
                                >
                                    <ListItemButton
                                        selected={sensor.id === selectedSensorId}
                                        onClick={() => handleSelect(sensor.id)}
                                        sx={{
                                            '&:hover': {
                                                bgcolor: 'action.hover',
                                            }
                                        }}
                                    >
                                        <ListItemText
                                            primary={
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant="body1" fontWeight="medium">
                                                        {sensor.name}
                                                    </Typography>
                                                    {sensor.id === selectedSensorId && (
                                                        <Chip label="Selected" size="small" color="primary" />
                                                    )}
                                                </Box>
                                            }
                                            secondary={
                                                <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                                                    <Chip
                                                        label={sensor.deviceName || 'Unknown Source'}
                                                        size="small"
                                                        icon={<DevicesIcon sx={{ fontSize: '0.8rem' }} />}
                                                    />
                                                    {sensor.componentName && (
                                                        <Chip label={sensor.componentName} size="small" />
                                                    )}
                                                    {sensor.sensorType && (
                                                        <Chip label={sensor.sensorType} size="small" variant="outlined" />
                                                    )}
                                                    <Chip
                                                        label={`${sensor.value} ${sensor.unit}`}
                                                        size="small"
                                                        color="info"
                                                    />
                                                </Box>
                                            }
                                        />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    ) : (
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                            gap: 2,
                            maxHeight: 400,
                            overflow: 'auto'
                        }}>
                            {filteredSensors.map(sensor => (
                                <Card
                                    key={sensor.id}
                                    sx={{
                                        cursor: 'pointer',
                                        border: '2px solid',
                                        borderColor: sensor.id === selectedSensorId ? 'primary.main' : 'divider',
                                        '&:hover': {
                                            boxShadow: 4,
                                            borderColor: 'primary.main'
                                        }
                                    }}
                                    onClick={() => handleSelect(sensor.id)}
                                >
                                    <CardContent>
                                        <Typography variant="subtitle2" gutterBottom noWrap>
                                            {sensor.name}
                                        </Typography>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
                                            <Chip
                                                label={sensor.deviceName || 'Unknown'}
                                                size="small"
                                                icon={<DevicesIcon sx={{ fontSize: '0.8rem' }} />}
                                            />
                                            {sensor.componentName && (
                                                <Chip label={sensor.componentName} size="small" />
                                            )}
                                            {sensor.sensorType && (
                                                <Chip label={sensor.sensorType} size="small" variant="outlined" />
                                            )}
                                            <Chip
                                                label={`${sensor.value} ${sensor.unit}`}
                                                size="small"
                                                color="info"
                                            />
                                            {sensor.id === selectedSensorId && (
                                                <Chip label="Selected" size="small" color="primary" />
                                            )}
                                        </Box>
                                    </CardContent>
                                </Card>
                            ))}
                        </Box>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    );
};

export default EventEngine_SensorSelector;