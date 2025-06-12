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

import React from "react";
import {
    Typography, Box, Button, Table, TableHead,
    TableRow, TableCell, TableBody, TextField, Paper,
    Chip, CircularProgress, TableContainer
} from "@mui/material";

// Icon imports
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DevicesIcon from '@mui/icons-material/Devices';
import DynamicFeed from '@mui/icons-material/DynamicFeed';
import HubIcon from '@mui/icons-material/Hub';

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
    defaultPollRate?: number; // Added default poll rate
    defaultSendRate?: number; // Added default send rate
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

const headerStyle = {
    padding: '8px 16px',
    borderBottom: '2px solid #ddd',
    fontWeight: 'bold',
    backgroundColor: '#f5f5f5'
};

const cellStyle = {
    padding: '6px 16px'
};

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
    if (loading) {
        return (
            <Box display="flex" justifyContent="center" my={4}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <>
            <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                <Typography variant="h6" sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: 2
                }}>
                    <HubIcon sx={{ mr: 1 }} />
                    Available Devices & Collectors
                </Typography>

                {allDevices.length === 0 && allCollectors.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        All available devices and collectors have been assigned.
                    </Typography>
                ) : (
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={headerStyle}>Name</TableCell>
                                    <TableCell sx={headerStyle}>Type</TableCell>
                                    <TableCell sx={headerStyle}>Connection</TableCell>
                                    <TableCell sx={headerStyle} align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {/* Devices Section */}
                                {allDevices.map((device: any) => (
                                    <TableRow key={`device-${device.id}`} hover>
                                        <TableCell sx={cellStyle}>
                                            <Box display="flex" alignItems="center">
                                                <DevicesIcon
                                                    fontSize="small"
                                                    sx={{ mr: 1, color: "primary.main" }}
                                                />
                                                <Typography variant="body2" fontWeight="medium">
                                                    {device.name}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={cellStyle}>
                                            <Box display="flex" alignItems="center">
                                                <Chip
                                                    size="small"
                                                    color="primary"
                                                    label="Device"
                                                    sx={{ mr: 1 }}
                                                />
                                                <Typography variant="body2" color="text.secondary">
                                                    {device.type}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={cellStyle}>
                                            {device.ipAddress ? `IP: ${device.ipAddress}` : '—'}
                                        </TableCell>
                                        <TableCell sx={cellStyle} align="right">
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
                                                        defaultPollRate: device.defaultPollRate,
                                                        defaultSendRate: device.defaultSendRate
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
                                                        defaultPollRate: device.defaultPollRate,
                                                        defaultSendRate: device.defaultSendRate
                                                    }, "Target")}
                                                    startIcon={<AddIcon />}
                                                >
                                                    Target
                                                </Button>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))}

                                {/* Collectors Section */}
                                {allCollectors.map((collector: any) => (
                                    <TableRow key={`collector-${collector.id}`} hover>
                                        <TableCell sx={cellStyle}>
                                            <Box display="flex" alignItems="center">
                                                <DynamicFeed
                                                    fontSize="small"
                                                    sx={{ mr: 1, color: "success.main" }}
                                                />
                                                <Typography variant="body2" fontWeight="medium">
                                                    {collector.name}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={cellStyle}>
                                            <Box display="flex" alignItems="center">
                                                <Chip
                                                    size="small"
                                                    color="success"
                                                    label="Collector"
                                                    sx={{ mr: 1 }}
                                                />
                                                <Typography variant="body2" color="text.secondary">
                                                    {collector.type}
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell sx={cellStyle}>
                                            {collector.url ? `URL: ${collector.url}` : '—'}
                                        </TableCell>
                                        <TableCell sx={cellStyle} align="right">
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
                                                        defaultPollRate: collector.defaultPollRate,
                                                        defaultSendRate: collector.defaultSendRate
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
                                                        defaultPollRate: collector.defaultPollRate,
                                                        defaultSendRate: collector.defaultSendRate
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
                )}
            </Paper>

            <Box display="flex" gap={3} mb={3}>
                {/* Sources */}
                <Paper
                    elevation={2}
                    sx={{
                        p: 3,
                        flex: 1,
                        borderRadius: 2,
                        height: "fit-content"
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
                        ) : (
                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={headerStyle}>Name</TableCell>
                                            <TableCell sx={headerStyle}>Type</TableCell>
                                            <TableCell sx={headerStyle}>Override Poll Rate (ms)</TableCell>
                                            <TableCell sx={headerStyle} align="right">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {sources.map((source: SourceOrTarget) => (
                                            <TableRow key={`source-${source.linkId}`} hover>
                                                <TableCell sx={cellStyle}>
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {source.name}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={cellStyle}>
                                                    <Chip
                                                        size="small"
                                                        color={source.type === "device" ? "primary" : "success"}
                                                        label={source.type === "device" ? "Device" : "Collector"}
                                                    />
                                                </TableCell>
                                                <TableCell sx={cellStyle}>
                                                    <TextField
                                                        size="small"
                                                        value={source.type === "device"
                                                            ? (devicePollRates[source.linkId || source.id] !== undefined
                                                                ? devicePollRates[source.linkId || source.id]
                                                                : source.defaultPollRate)
                                                            : (collectorPollRates[source.linkId || source.id] !== undefined
                                                                ? collectorPollRates[source.linkId || source.id]
                                                                : source.defaultPollRate)
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
                                                        placeholder="Enter value"
                                                        label="Poll Rate"
                                                        helperText={
                                                            source.type === "device"
                                                                ? (devicePollRates[source.linkId || source.id] === 0 ? "Using global default" : "")
                                                                : (collectorPollRates[source.linkId || source.id] === 0 ? "Using global default" : "")
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell sx={cellStyle} align="right">
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
                        borderRadius: 2,
                        height: "fit-content"
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
                        ) : (
                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={headerStyle}>Name</TableCell>
                                            <TableCell sx={headerStyle}>Type</TableCell>
                                            <TableCell sx={headerStyle}>Override Send Rate (ms)</TableCell>
                                            <TableCell sx={headerStyle} align="right">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {targets.map((target: SourceOrTarget) => (
                                            <TableRow key={`target-${target.linkId}`} hover>
                                                <TableCell sx={cellStyle}>
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {target.name}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={cellStyle}>
                                                    <Chip
                                                        size="small"
                                                        color={target.type === "device" ? "primary" : "success"}
                                                        label={target.type === "device" ? "Device" : "Collector"}
                                                    />
                                                </TableCell>
                                                <TableCell sx={cellStyle}>
                                                    <TextField
                                                        size="small"
                                                        value={target.type === "device"
                                                            ? (deviceSendRates[target.linkId || target.id] !== undefined
                                                                ? deviceSendRates[target.linkId || target.id]
                                                                : target.defaultSendRate)
                                                            : (collectorSendRates[target.linkId || target.id] !== undefined
                                                                ? collectorSendRates[target.linkId || target.id]
                                                                : target.defaultSendRate)
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
                                                        placeholder="Enter value"
                                                        label="Send Rate"
                                                        helperText={
                                                            target.type === "device"
                                                                ? (deviceSendRates[target.linkId || target.id] === 0 ? "Using global default" : "")
                                                                : (collectorSendRates[target.linkId || target.id] === 0 ? "Using global default" : "")
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell sx={cellStyle} align="right">
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
        </>
    );
};

export default AvailableSourcesTargetsTable;