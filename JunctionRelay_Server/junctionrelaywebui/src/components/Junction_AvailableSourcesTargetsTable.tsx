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

import React, { useState, useEffect } from "react";
import {
    Typography, Box, Button, Table, TableHead,
    TableRow, TableCell, TableBody, TextField, Paper,
    Chip, CircularProgress, TableContainer, Accordion,
    AccordionSummary, AccordionDetails, useTheme, useMediaQuery,
    ToggleButtonGroup, ToggleButton
} from "@mui/material";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

// Icon imports
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DevicesIcon from '@mui/icons-material/Devices';
import DynamicFeed from '@mui/icons-material/DynamicFeed';
import HubIcon from '@mui/icons-material/Hub';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';

interface SourceOrTarget {
    linkId?: number;
    id: number;
    type: "device" | "collector";
    name: string;
    description: string;
    ipAddress?: string;
    url?: string;
    role?: string;
    pollRateOverride?: number;
    sendRateOverride?: number;
    defaultPollRate?: number;
    defaultSendRate?: number;
}

interface AvailableSourcesTargetsTableProps {
    loading: boolean;
    allDevices: any[];
    allCollectors: any[];
    sources: SourceOrTarget[];
    targets: SourceOrTarget[];
    devicePollRates: { [key: number]: number };
    deviceSendRates: { [key: number]: number };
    collectorPollRates: { [key: number]: number };
    collectorSendRates: { [key: number]: number };
    handleAdd: (item: SourceOrTarget, role: string) => Promise<void>;
    handleRemove: (item: SourceOrTarget) => Promise<void>;
    handlePollRateOverrideChange: (
        event: React.ChangeEvent<HTMLInputElement>,
        linkId: number,
        type: "device" | "collector"
    ) => Promise<void>;
    handleSendRateOverrideChange: (
        event: React.ChangeEvent<HTMLInputElement>,
        linkId: number,
        type: "device" | "collector"
    ) => Promise<void>;
}

type ViewMode = 'table' | 'standard' | 'mini';

// Version the localStorage keys
const STORAGE_VERSION = "v1";
const STORAGE_KEY_EXPANDED = `availableSourcesTargetsExpanded_${STORAGE_VERSION}`;
const STORAGE_KEY_VIEW_MODE = `availableSourcesTargetsViewMode_${STORAGE_VERSION}`;

const AvailableSourcesTargetsTable: React.FC<AvailableSourcesTargetsTableProps> = ({
    loading,
    allDevices,
    allCollectors,
    sources,
    targets,
    devicePollRates,
    deviceSendRates,
    collectorPollRates,
    collectorSendRates,
    handleAdd,
    handleRemove,
    handlePollRateOverrideChange,
    handleSendRateOverrideChange
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // Manage accordion expanded state with localStorage
    const [expanded, setExpanded] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_EXPANDED);
            return saved !== null ? saved === 'true' : true;
        } catch (error) {
            console.error("Error accessing localStorage for AvailableSourcesTargetsTable:", error);
            return true;
        }
    });

    // Manage view mode with localStorage
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_VIEW_MODE);
            return (saved as ViewMode) || 'table';  
        } catch (error) {
            console.error("Error accessing localStorage for view mode:", error);
            return 'table'; 
        }
    });

    // Save states to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY_EXPANDED, expanded.toString());
        } catch (error) {
            console.error("Error saving to localStorage:", error);
        }
    }, [expanded]);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY_VIEW_MODE, viewMode);
        } catch (error) {
            console.error("Error saving view mode to localStorage:", error);
        }
    }, [viewMode]);

    const handleAccordionChange = (_event: React.SyntheticEvent, isExpanded: boolean) => {
        setExpanded(isExpanded);
    };

    const handleViewModeChange = (_event: React.MouseEvent<HTMLElement>, newMode: ViewMode) => {
        if (newMode !== null) {
            setViewMode(newMode);
        }
    };

    // Calculate grid columns based on view mode
    const getGridColumns = () => {
        if (viewMode === 'mini') {
            return {
                xs: 'repeat(2, 1fr)',
                sm: 'repeat(3, 1fr)',
                md: 'repeat(4, 1fr)',
                lg: 'repeat(6, 1fr)'
            };
        } else if (viewMode === 'standard') {
            return {
                xs: '1fr',
                sm: 'repeat(2, 1fr)',
                md: 'repeat(3, 1fr)',
                lg: 'repeat(4, 1fr)'
            };
        }
        return {};
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" my={4}>
                <CircularProgress />
            </Box>
        );
    }

    const allItems = [...allDevices, ...allCollectors];

    return (
        <Accordion
            expanded={expanded}
            onChange={handleAccordionChange}
            sx={{ mb: 3 }}
        >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center" gap={1} width="100%">
                    <HubIcon />
                    <Typography variant="h6">
                        Available Devices & Collectors
                    </Typography>
                    <Chip
                        size="small"
                        label={`${allDevices.length + allCollectors.length} available`}
                        color="default"
                    />
                    <Box sx={{ ml: 'auto', mr: 2 }}>
                        <ToggleButtonGroup
                            value={viewMode}
                            exclusive
                            onChange={handleViewModeChange}
                            size="small"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <ToggleButton value="table" aria-label="table view">
                                <TableViewIcon fontSize="small" />
                            </ToggleButton>
                            <ToggleButton value="standard" aria-label="standard tiles">
                                <DashboardIcon fontSize="small" />
                            </ToggleButton>
                            <ToggleButton value="mini" aria-label="mini tiles">
                                <ViewModuleIcon fontSize="small" />
                            </ToggleButton>
                        </ToggleButtonGroup>
                    </Box>
                </Box>
            </AccordionSummary>
            <AccordionDetails>
                <Box>
                    {allDevices.length === 0 && allCollectors.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                            All available devices and collectors have been assigned.
                        </Typography>
                    ) : viewMode === 'table' ? (
                        /* Table View */
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Name</TableCell>
                                        <TableCell>Type</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {allDevices.map((device: any) => (
                                        <TableRow key={`device-${device.id}`} hover>
                                            <TableCell>
                                                <Box display="flex" alignItems="center">
                                                    <DevicesIcon
                                                        fontSize="small"
                                                        sx={{ mr: 1, color: "primary.main" }}
                                                    />
                                                    <Box>
                                                        <Typography variant="body2" fontWeight="medium">
                                                            {device.name}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {device.type}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    color="primary"
                                                    label="Device"
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Box display="flex" gap={1} justifyContent="flex-end">
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="primary"
                                                        onClick={() => handleAdd({
                                                            id: device.id,
                                                            type: "device",
                                                            name: device.name,
                                                            description: device.type,
                                                            ipAddress: device.ipAddress,
                                                            pollRateOverride: device.pollRate,
                                                            sendRateOverride: device.sendRate
                                                        }, "Source")}
                                                        startIcon={<AddIcon />}
                                                    >
                                                        Source
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="primary"
                                                        onClick={() => handleAdd({
                                                            id: device.id,
                                                            type: "device",
                                                            name: device.name,
                                                            description: device.type,
                                                            ipAddress: device.ipAddress,
                                                            pollRateOverride: device.pollRate,
                                                            sendRateOverride: device.sendRate
                                                        }, "Target")}
                                                        startIcon={<AddIcon />}
                                                    >
                                                        Target
                                                    </Button>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                    {allCollectors.map((collector: any) => (
                                        <TableRow key={`collector-${collector.id}`} hover>
                                            <TableCell>
                                                <Box display="flex" alignItems="center">
                                                    <DynamicFeed
                                                        fontSize="small"
                                                        sx={{ mr: 1, color: "success.main" }}
                                                    />
                                                    <Box>
                                                        <Typography variant="body2" fontWeight="medium">
                                                            {collector.name}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {collector.type}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    color="success"
                                                    label="Collector"
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Box display="flex" gap={1} justifyContent="flex-end">
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="success"
                                                        onClick={() => handleAdd({
                                                            id: collector.id,
                                                            type: "collector",
                                                            name: collector.name,
                                                            description: collector.type,
                                                            url: collector.url,
                                                            pollRateOverride: collector.pollRate,
                                                            sendRateOverride: collector.sendRate
                                                        }, "Source")}
                                                        startIcon={<AddIcon />}
                                                    >
                                                        Source
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="success"
                                                        onClick={() => handleAdd({
                                                            id: collector.id,
                                                            type: "collector",
                                                            name: collector.name,
                                                            description: collector.type,
                                                            url: collector.url,
                                                            pollRateOverride: collector.pollRate,
                                                            sendRateOverride: collector.sendRate
                                                        }, "Target")}
                                                        startIcon={<AddIcon />}
                                                    >
                                                        Target
                                                    </Button>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : viewMode === 'standard' ? (
                        /* Standard Tile View */
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: getGridColumns(),
                            gap: 2
                        }}>
                            {allDevices.map((device: any) => (
                                <Paper
                                    key={`device-${device.id}`}
                                    variant="outlined"
                                    sx={{ p: 2 }}
                                >
                                    <Box display="flex" alignItems="center" mb={1}>
                                        <DevicesIcon
                                            fontSize="small"
                                            sx={{ mr: 1, color: "primary.main" }}
                                        />
                                        <Typography variant="body2" fontWeight="medium" noWrap>
                                            {device.name}
                                        </Typography>
                                    </Box>
                                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                                        <Chip
                                            size="small"
                                            color="primary"
                                            label="Device"
                                        />
                                        <Typography variant="caption" color="text.secondary" noWrap>
                                            {device.type}
                                        </Typography>
                                    </Box>
                                    <Box display="flex" gap={1} flexDirection="column">
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            color="primary"
                                            onClick={() => handleAdd({
                                                id: device.id,
                                                type: "device",
                                                name: device.name,
                                                description: device.type,
                                                ipAddress: device.ipAddress,
                                                pollRateOverride: device.pollRate,
                                                sendRateOverride: device.sendRate
                                            }, "Source")}
                                            startIcon={<AddIcon />}
                                        >
                                            Source
                                        </Button>
                                        <Button
                                            size="small"
                                            variant="contained"
                                            color="primary"
                                            onClick={() => handleAdd({
                                                id: device.id,
                                                type: "device",
                                                name: device.name,
                                                description: device.type,
                                                ipAddress: device.ipAddress,
                                                pollRateOverride: device.pollRate,
                                                sendRateOverride: device.sendRate
                                            }, "Target")}
                                            startIcon={<AddIcon />}
                                        >
                                            Target
                                        </Button>
                                    </Box>
                                </Paper>
                            ))}

                            {allCollectors.map((collector: any) => (
                                <Paper
                                    key={`collector-${collector.id}`}
                                    variant="outlined"
                                    sx={{ p: 2 }}
                                >
                                    <Box display="flex" alignItems="center" mb={1}>
                                        <DynamicFeed
                                            fontSize="small"
                                            sx={{ mr: 1, color: "success.main" }}
                                        />
                                        <Typography variant="body2" fontWeight="medium" noWrap>
                                            {collector.name}
                                        </Typography>
                                    </Box>
                                    <Box display="flex" alignItems="center" gap={1} mb={2}>
                                        <Chip
                                            size="small"
                                            color="success"
                                            label="Collector"
                                        />
                                        <Typography variant="caption" color="text.secondary" noWrap>
                                            {collector.type}
                                        </Typography>
                                    </Box>
                                    <Box display="flex" gap={1} flexDirection="column">
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            color="success"
                                            onClick={() => handleAdd({
                                                id: collector.id,
                                                type: "collector",
                                                name: collector.name,
                                                description: collector.type,
                                                url: collector.url,
                                                pollRateOverride: collector.pollRate,
                                                sendRateOverride: collector.sendRate
                                            }, "Source")}
                                            startIcon={<AddIcon />}
                                        >
                                            Source
                                        </Button>
                                        <Button
                                            size="small"
                                            variant="contained"
                                            color="success"
                                            onClick={() => handleAdd({
                                                id: collector.id,
                                                type: "collector",
                                                name: collector.name,
                                                description: collector.type,
                                                url: collector.url,
                                                pollRateOverride: collector.pollRate,
                                                sendRateOverride: collector.sendRate
                                            }, "Target")}
                                            startIcon={<AddIcon />}
                                        >
                                            Target
                                        </Button>
                                    </Box>
                                </Paper>
                            ))}
                        </Box>
                    ) : (
                        /* Mini Tile View */
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: getGridColumns(),
                            gap: 1
                        }}>
                            {allDevices.map((device: any) => (
                                <Paper
                                    key={`device-${device.id}`}
                                    variant="outlined"
                                    sx={{ p: 1.5 }}
                                >
                                    <Box display="flex" alignItems="center" mb={1}>
                                        <DevicesIcon
                                            fontSize="small"
                                            sx={{ mr: 0.5, color: "primary.main" }}
                                        />
                                        <Typography variant="caption" fontWeight="medium" noWrap>
                                            {device.name}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        size="small"
                                        color="primary"
                                        label="Device"
                                        sx={{ mb: 1, fontSize: '0.7rem', height: '20px' }}
                                    />
                                    <Box display="flex" gap={0.5} flexDirection="column">
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            color="primary"
                                            onClick={() => handleAdd({
                                                id: device.id,
                                                type: "device",
                                                name: device.name,
                                                description: device.type,
                                                ipAddress: device.ipAddress,
                                                pollRateOverride: device.pollRate,
                                                sendRateOverride: device.sendRate
                                            }, "Source")}
                                            sx={{ fontSize: '0.7rem', py: 0.5 }}
                                        >
                                            Source
                                        </Button>
                                        <Button
                                            size="small"
                                            variant="contained"
                                            color="primary"
                                            onClick={() => handleAdd({
                                                id: device.id,
                                                type: "device",
                                                name: device.name,
                                                description: device.type,
                                                ipAddress: device.ipAddress,
                                                pollRateOverride: device.pollRate,
                                                sendRateOverride: device.sendRate
                                            }, "Target")}
                                            sx={{ fontSize: '0.7rem', py: 0.5 }}
                                        >
                                            Target
                                        </Button>
                                    </Box>
                                </Paper>
                            ))}

                            {allCollectors.map((collector: any) => (
                                <Paper
                                    key={`collector-${collector.id}`}
                                    variant="outlined"
                                    sx={{ p: 1.5 }}
                                >
                                    <Box display="flex" alignItems="center" mb={1}>
                                        <DynamicFeed
                                            fontSize="small"
                                            sx={{ mr: 0.5, color: "success.main" }}
                                        />
                                        <Typography variant="caption" fontWeight="medium" noWrap>
                                            {collector.name}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        size="small"
                                        color="success"
                                        label="Collector"
                                        sx={{ mb: 1, fontSize: '0.7rem', height: '20px' }}
                                    />
                                    <Box display="flex" gap={0.5} flexDirection="column">
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            color="success"
                                            onClick={() => handleAdd({
                                                id: collector.id,
                                                type: "collector",
                                                name: collector.name,
                                                description: collector.type,
                                                url: collector.url,
                                                pollRateOverride: collector.pollRate,
                                                sendRateOverride: collector.sendRate
                                            }, "Source")}
                                            sx={{ fontSize: '0.7rem', py: 0.5 }}
                                        >
                                            Source
                                        </Button>
                                        <Button
                                            size="small"
                                            variant="contained"
                                            color="success"
                                            onClick={() => handleAdd({
                                                id: collector.id,
                                                type: "collector",
                                                name: collector.name,
                                                description: collector.type,
                                                url: collector.url,
                                                pollRateOverride: collector.pollRate,
                                                sendRateOverride: collector.sendRate
                                            }, "Target")}
                                            sx={{ fontSize: '0.7rem', py: 0.5 }}
                                        >
                                            Target
                                        </Button>
                                    </Box>
                                </Paper>
                            ))}
                        </Box>
                    )}

                    {/* Sources and Targets Section */}
                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: { xs: 'column', md: 'row' },
                            gap: 3,
                            mt: 3
                        }}
                    >
                        {/* Sources */}
                        <Paper
                            elevation={2}
                            sx={{
                                p: 3,
                                flex: 1,
                                width: '100%',
                                borderRadius: 2,
                                height: 'fit-content'
                            }}
                        >
                            <Typography variant="h6" gutterBottom sx={{
                                display: 'flex',
                                alignItems: 'center',
                                mb: 2
                            }}>
                                <DynamicFeed sx={{ mr: 1 }} />
                                Sources ({sources.length})
                            </Typography>

                            <Box
                                sx={{
                                    maxHeight: 400,
                                    overflowY: "auto",
                                    pr: 1
                                }}
                            >
                                {sources.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">
                                        No sources selected. Add devices or collectors as sources.
                                    </Typography>
                                ) : isMobile ? (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        {sources.map((source: SourceOrTarget) => (
                                            <Paper
                                                key={`source-${source.linkId}`}
                                                variant="outlined"
                                                sx={{ p: 2 }}
                                            >
                                                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight="medium" mb={0.5}>
                                                            {source.name}
                                                        </Typography>
                                                        <Chip
                                                            size="small"
                                                            color={source.type === "device" ? "primary" : "success"}
                                                            label={source.type === "device" ? "Device" : "Collector"}
                                                        />
                                                    </Box>
                                                    <Button
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleRemove(source)}
                                                        startIcon={<RemoveIcon />}
                                                    >
                                                        Remove
                                                    </Button>
                                                </Box>
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    value={source.type === "device"
                                                        ? (devicePollRates[source.linkId || source.id] !== undefined
                                                            ? devicePollRates[source.linkId || source.id]
                                                            : source.pollRateOverride || 0)
                                                        : (collectorPollRates[source.linkId || source.id] !== undefined
                                                            ? collectorPollRates[source.linkId || source.id]
                                                            : source.pollRateOverride || 0)
                                                    }
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                        handlePollRateOverrideChange(e, source.linkId || source.id, source.type)
                                                    }
                                                    type="number"
                                                    slotProps={{
                                                        htmlInput: { min: 0 }
                                                    }}
                                                    variant="outlined"
                                                    required
                                                    label="Override Poll Rate (ms)"
                                                    helperText={
                                                        source.type === "device"
                                                            ? (devicePollRates[source.linkId || source.id] === 0 ? "Using global default" : "")
                                                            : (collectorPollRates[source.linkId || source.id] === 0 ? "Using global default" : "")
                                                    }
                                                />
                                            </Paper>
                                        ))}
                                    </Box>
                                ) : (
                                    <TableContainer component={Paper} variant="outlined">
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Name</TableCell>
                                                    <TableCell>Type</TableCell>
                                                    <TableCell>Override Poll Rate (ms)</TableCell>
                                                    <TableCell align="right">Actions</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {sources.map((source: SourceOrTarget) => (
                                                    <TableRow key={`source-${source.linkId}`} hover>
                                                        <TableCell>
                                                            <Typography variant="body2" fontWeight="medium">
                                                                {source.name}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Chip
                                                                size="small"
                                                                color={source.type === "device" ? "primary" : "success"}
                                                                label={source.type === "device" ? "Device" : "Collector"}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <TextField
                                                                size="small"
                                                                value={source.type === "device"
                                                                    ? (devicePollRates[source.linkId || source.id] !== undefined
                                                                        ? devicePollRates[source.linkId || source.id]
                                                                        : source.pollRateOverride || 0)
                                                                    : (collectorPollRates[source.linkId || source.id] !== undefined
                                                                        ? collectorPollRates[source.linkId || source.id]
                                                                        : source.pollRateOverride || 0)
                                                                }
                                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                                    handlePollRateOverrideChange(e, source.linkId || source.id, source.type)
                                                                }
                                                                type="number"
                                                                slotProps={{
                                                                    htmlInput: { min: 0 }
                                                                }}
                                                                sx={{ width: "120px" }}
                                                                variant="outlined"
                                                                required
                                                                label="Poll Rate"
                                                                helperText={
                                                                    source.type === "device"
                                                                        ? (devicePollRates[source.linkId || source.id] === 0 ? "Using global default" : "")
                                                                        : (collectorPollRates[source.linkId || source.id] === 0 ? "Using global default" : "")
                                                                }
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Button
                                                                size="small"
                                                                color="error"
                                                                onClick={() => handleRemove(source)}
                                                                startIcon={<RemoveIcon />}
                                                            >
                                                                Remove
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}
                            </Box>
                        </Paper>

                        {/* Targets */}
                        <Paper
                            elevation={2}
                            sx={{
                                p: 3,
                                flex: 1,
                                width: '100%',
                                borderRadius: 2,
                                height: 'fit-content'
                            }}
                        >
                            <Typography variant="h6" gutterBottom sx={{
                                display: 'flex',
                                alignItems: 'center',
                                mb: 2
                            }}>
                                <DevicesIcon sx={{ mr: 1 }} />
                                Targets ({targets.length})
                            </Typography>

                            <Box
                                sx={{
                                    maxHeight: 400,
                                    overflowY: "auto",
                                    pr: 1
                                }}
                            >
                                {targets.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">
                                        No targets selected. Add devices or collectors as targets.
                                    </Typography>
                                ) : isMobile ? (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        {targets.map((target: SourceOrTarget) => (
                                            <Paper
                                                key={`target-${target.linkId}`}
                                                variant="outlined"
                                                sx={{ p: 2 }}
                                            >
                                                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight="medium" mb={0.5}>
                                                            {target.name}
                                                        </Typography>
                                                        <Chip
                                                            size="small"
                                                            color={target.type === "device" ? "primary" : "success"}
                                                            label={target.type === "device" ? "Device" : "Collector"}
                                                        />
                                                    </Box>
                                                    <Button
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleRemove(target)}
                                                        startIcon={<RemoveIcon />}
                                                    >
                                                        Remove
                                                    </Button>
                                                </Box>
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    value={target.type === "device"
                                                        ? (deviceSendRates[target.linkId || target.id] !== undefined
                                                            ? deviceSendRates[target.linkId || target.id]
                                                            : target.sendRateOverride || 0)
                                                        : (collectorSendRates[target.linkId || target.id] !== undefined
                                                            ? collectorSendRates[target.linkId || target.id]
                                                            : target.sendRateOverride || 0)
                                                    }
                                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                        handleSendRateOverrideChange(e, target.linkId || target.id, target.type)
                                                    }
                                                    type="number"
                                                    slotProps={{
                                                        htmlInput: { min: 0 }
                                                    }}
                                                    variant="outlined"
                                                    required
                                                    label="Override Send Rate (ms)"
                                                    helperText={
                                                        target.type === "device"
                                                            ? (deviceSendRates[target.linkId || target.id] === 0 ? "Using global default" : "")
                                                            : (collectorSendRates[target.linkId || target.id] === 0 ? "Using global default" : "")
                                                    }
                                                />
                                            </Paper>
                                        ))}
                                    </Box>
                                ) : (
                                    <TableContainer component={Paper} variant="outlined">
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Name</TableCell>
                                                    <TableCell>Type</TableCell>
                                                    <TableCell>Override Send Rate (ms)</TableCell>
                                                    <TableCell align="right">Actions</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {targets.map((target: SourceOrTarget) => (
                                                    <TableRow key={`target-${target.linkId}`} hover>
                                                        <TableCell>
                                                            <Typography variant="body2" fontWeight="medium">
                                                                {target.name}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Chip
                                                                size="small"
                                                                color={target.type === "device" ? "primary" : "success"}
                                                                label={target.type === "device" ? "Device" : "Collector"}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <TextField
                                                                size="small"
                                                                value={target.type === "device"
                                                                    ? (deviceSendRates[target.linkId || target.id] !== undefined
                                                                        ? deviceSendRates[target.linkId || target.id]
                                                                        : target.sendRateOverride || 0)
                                                                    : (collectorSendRates[target.linkId || target.id] !== undefined
                                                                        ? collectorSendRates[target.linkId || target.id]
                                                                        : target.sendRateOverride || 0)
                                                                }
                                                                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                                    handleSendRateOverrideChange(e, target.linkId || target.id, target.type)
                                                                }
                                                                type="number"
                                                                slotProps={{
                                                                    htmlInput: { min: 0 }
                                                                }}
                                                                sx={{ width: "120px" }}
                                                                variant="outlined"
                                                                required
                                                                label="Send Rate"
                                                                helperText={
                                                                    target.type === "device"
                                                                        ? (deviceSendRates[target.linkId || target.id] === 0 ? "Using global default" : "")
                                                                        : (collectorSendRates[target.linkId || target.id] === 0 ? "Using global default" : "")
                                                                }
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Button
                                                                size="small"
                                                                color="error"
                                                                onClick={() => handleRemove(target)}
                                                                startIcon={<RemoveIcon />}
                                                            >
                                                                Remove
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}
                            </Box>
                        </Paper>
                    </Box>
                </Box>
            </AccordionDetails>
        </Accordion>
    );
};

export default AvailableSourcesTargetsTable;