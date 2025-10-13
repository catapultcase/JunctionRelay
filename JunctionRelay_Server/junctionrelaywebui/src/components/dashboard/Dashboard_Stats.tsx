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

import React, { useState, useEffect, useMemo } from "react";
import {
    Typography,
    Box,
    Chip,
    Card,
    CardHeader,
    CardContent,
    Collapse,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Divider,
    CircularProgress,
} from "@mui/material";

// Import icons
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import StorageIcon from '@mui/icons-material/Storage';
import StreamIcon from '@mui/icons-material/Stream';
import SensorsIcon from '@mui/icons-material/Sensors';
import InfoIcon from '@mui/icons-material/Info';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

// Junction type definition
export interface Junction {
    id: number;
    name: string;
    status: string;
    showOnDashboard?: boolean;
    sortOrder: number;
    autoStartOnLaunch?: boolean;
}

interface WarningDetail {
    id: number;
    type: 'error' | 'warning';
    title: string;
    description: string;
    timestamp: string;
    area: string;
    collectorId?: number;
}

interface HealthInfo {
    status: string;
    severity: 'success' | 'warning' | 'error';
}

interface StatArea {
    active: number;
    health: HealthInfo;
    hasIssues: boolean;
    details: WarningDetail[];
}

interface DashboardStatsData {
    junctions: StatArea;
    collectors: StatArea;
    streams: StatArea;
    sensors: StatArea;
}

interface DashboardStatsProps {
    junctions: Junction[];
}

const DashboardStats: React.FC<DashboardStatsProps> = ({ junctions }) => {
    const [overviewExpanded, setOverviewExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem('dashboard_overview_expanded');
        return saved !== null ? saved === 'true' : false;
    });

    const [loading, setLoading] = useState<boolean>(true);
    const [collectorStats, setCollectorStats] = useState<any>(null);
    const [streamStats, setStreamStats] = useState<any>(null);

    // Persist overview expansion state
    useEffect(() => {
        localStorage.setItem('dashboard_overview_expanded', overviewExpanded.toString());
    }, [overviewExpanded]);

    // Fetch stats from API
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [collectorsResponse, streamsResponse] = await Promise.all([
                    fetch('/api/collectors/stats'),
                    fetch('/api/connections/streams/stats')
                ]);

                if (collectorsResponse.ok) {
                    const data = await collectorsResponse.json();
                    setCollectorStats(data);
                } else {
                    console.error('Failed to fetch collector stats');
                }

                if (streamsResponse.ok) {
                    const data = await streamsResponse.json();
                    setStreamStats(data);
                } else {
                    console.error('Failed to fetch stream stats');
                }
            } catch (error) {
                console.error('Error fetching stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();

        // Poll for updates every 5 seconds
        const interval = setInterval(fetchStats, 5000);

        return () => clearInterval(interval);
    }, []);

    // Calculate stats from junctions data and API data
    const dashboardStats = useMemo<DashboardStatsData>(() => {
        const activeJunctions = junctions.filter(j => j.status === 'Running').length;

        // Use real collector data from API
        const collectorsData = collectorStats?.collectors ? {
            active: collectorStats.collectors.active || 0,
            health: {
                status: collectorStats.collectors.health?.status || 'Unknown',
                severity: collectorStats.collectors.health?.severity || 'success'
            },
            hasIssues: collectorStats.collectors.hasIssues || false,
            details: (collectorStats.collectors.details || []).map((d: any) => ({
                ...d,
                area: 'Collectors'
            }))
        } : {
            active: 0,
            health: { status: 'Loading...', severity: 'success' as const },
            hasIssues: false,
            details: []
        };

        // Use real stream data from API
        const streamsData = streamStats ? {
            active: streamStats.active || 0,
            health: {
                status: streamStats.health?.status || 'Unknown',
                severity: streamStats.health?.severity || 'success'
            },
            hasIssues: streamStats.hasIssues || false,
            details: (streamStats.details || []).map((d: any) => ({
                ...d,
                area: 'Streams'
            }))
        } : {
            active: 0,
            health: { status: 'Loading...', severity: 'success' as const },
            hasIssues: false,
            details: []
        };

        // Use real sensor data from collectors API
        const sensorsData = collectorStats?.sensors ? {
            active: collectorStats.sensors.active || 0,
            health: {
                status: collectorStats.sensors.health?.status || 'Unknown',
                severity: collectorStats.sensors.health?.severity || 'success'
            },
            hasIssues: collectorStats.sensors.hasIssues || false,
            details: (collectorStats.sensors.details || []).map((d: any) => ({
                ...d,
                area: 'Sensors'
            }))
        } : {
            active: 0,
            health: { status: 'Loading...', severity: 'success' as const },
            hasIssues: false,
            details: []
        };

        return {
            junctions: {
                active: activeJunctions,
                health: { status: 'All Healthy', severity: 'success' },
                hasIssues: false,
                details: []
            },
            collectors: collectorsData,
            streams: streamsData,
            sensors: sensorsData
        };
    }, [junctions, collectorStats, streamStats]);

    // Get all warnings grouped by area
    const getAllWarnings = (): WarningDetail[] => {
        const allWarnings: WarningDetail[] = [];

        (Object.entries(dashboardStats) as [string, StatArea][]).forEach(([area, data]) => {
            if (data.hasIssues && data.details) {
                data.details.forEach((detail: WarningDetail) => {
                    allWarnings.push({
                        ...detail,
                        area: area.charAt(0).toUpperCase() + area.slice(1)
                    });
                });
            }
        });

        // Sort by timestamp (most recent first)
        return allWarnings.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    };

    return (
        <Card sx={{ mb: 3 }}>
            <CardHeader
                title={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <InfoIcon color="primary" />
                        <Typography variant="h6">
                            System Overview
                        </Typography>
                    </Box>
                }
                sx={{ pb: 1 }}
            />

            <CardContent sx={{ pt: 0 }}>
                {/* Stats Grid - Always Visible */}
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: {
                            xs: 'repeat(2, 1fr)',
                            sm: 'repeat(4, 1fr)'
                        },
                        gap: 2,
                        mb: 3
                    }}>
                        {/* Active Junctions */}
                        <Box sx={{ textAlign: 'center' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                                <AccountTreeIcon sx={{ mr: 1, color: 'primary.main' }} />
                                <Typography variant="h4" color="primary.main">
                                    {dashboardStats.junctions.active}
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                {dashboardStats.junctions.active === 1 ? 'Active Junction' : 'Active Junctions'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                                <Chip
                                    label={dashboardStats.junctions.health.status}
                                    color={dashboardStats.junctions.health.severity}
                                    size="small"
                                    variant="outlined"
                                />
                            </Box>
                        </Box>

                        {/* Active Collectors */}
                        <Box sx={{ textAlign: 'center' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                                <StorageIcon sx={{ mr: 1, color: 'secondary.main' }} />
                                <Typography variant="h4" color="secondary.main">
                                    {dashboardStats.collectors.active}
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                {dashboardStats.collectors.active === 1 ? 'Active Collector' : 'Active Collectors'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                {dashboardStats.collectors.health.severity === 'error' ? (
                                    <ErrorIcon sx={{ color: 'error.main', fontSize: 20 }} />
                                ) : dashboardStats.collectors.health.severity === 'warning' ? (
                                    <WarningIcon sx={{ color: 'warning.main', fontSize: 20 }} />
                                ) : (
                                    <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                                )}
                                <Chip
                                    label={dashboardStats.collectors.health.status}
                                    color={dashboardStats.collectors.health.severity}
                                    size="small"
                                    variant="outlined"
                                />
                            </Box>
                        </Box>

                        {/* Active Streams */}
                        <Box sx={{ textAlign: 'center' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                                <StreamIcon sx={{ mr: 1, color: 'success.main' }} />
                                <Typography variant="h4" color="success.main">
                                    {dashboardStats.streams.active}
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                {dashboardStats.streams.active === 1 ? 'Active Stream' : 'Active Streams'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                {dashboardStats.streams.health.severity === 'error' ? (
                                    <ErrorIcon sx={{ color: 'error.main', fontSize: 20 }} />
                                ) : dashboardStats.streams.health.severity === 'warning' ? (
                                    <WarningIcon sx={{ color: 'warning.main', fontSize: 20 }} />
                                ) : (
                                    <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                                )}
                                <Chip
                                    label={dashboardStats.streams.health.status}
                                    color={dashboardStats.streams.health.severity}
                                    size="small"
                                    variant="outlined"
                                />
                            </Box>
                        </Box>

                        {/* Active Sensors */}
                        <Box sx={{ textAlign: 'center' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
                                <SensorsIcon sx={{ mr: 1, color: 'info.main' }} />
                                <Typography variant="h4" color="info.main">
                                    {dashboardStats.sensors.active}
                                </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                {dashboardStats.sensors.active === 1 ? 'Active Sensor' : 'Active Sensors'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                {dashboardStats.sensors.health.severity === 'error' ? (
                                    <ErrorIcon sx={{ color: 'error.main', fontSize: 20 }} />
                                ) : dashboardStats.sensors.health.severity === 'warning' ? (
                                    <WarningIcon sx={{ color: 'warning.main', fontSize: 20 }} />
                                ) : (
                                    <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                                )}
                                <Chip
                                    label={dashboardStats.sensors.health.status}
                                    color={dashboardStats.sensors.health.severity}
                                    size="small"
                                    variant="outlined"
                                />
                            </Box>
                        </Box>
                    </Box>
                )}

                {/* Collapsible Current Warnings Section */}
                <Divider sx={{ mb: 2 }} />

                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    p: 1,
                    borderRadius: 1,
                    '&:hover': { backgroundColor: 'action.hover' }
                }}
                    onClick={() => setOverviewExpanded(!overviewExpanded)}
                >
                    {(() => {
                        const allWarnings = getAllWarnings();
                        const errorCount = allWarnings.filter(w => w.type === 'error').length;
                        const warningCount = allWarnings.filter(w => w.type === 'warning').length;

                        if (allWarnings.length === 0) {
                            return (
                                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CheckCircleIcon color="success" />
                                    No Warnings
                                </Typography>
                            );
                        }

                        return (
                            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <WarningIcon color="warning" />
                                Current Warnings
                                <Box component="span" sx={{ ml: 1, display: 'flex', gap: 1 }}>
                                    {errorCount > 0 && (
                                        <Chip
                                            label={`${errorCount} Error${errorCount !== 1 ? 's' : ''}`}
                                            color="error"
                                            size="small"
                                            variant="outlined"
                                        />
                                    )}
                                    {warningCount > 0 && (
                                        <Chip
                                            label={`${warningCount} Warning${warningCount !== 1 ? 's' : ''}`}
                                            color="warning"
                                            size="small"
                                            variant="outlined"
                                        />
                                    )}
                                </Box>
                            </Typography>
                        );
                    })()}
                    <IconButton size="small">
                        {overviewExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                </Box>

                <Collapse in={overviewExpanded}>
                    <Box sx={{ mt: 2 }}>
                        {getAllWarnings().length > 0 ? (
                            <TableContainer component={Paper} variant="outlined">
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Area</TableCell>
                                            <TableCell>Severity</TableCell>
                                            <TableCell>Issue</TableCell>
                                            <TableCell>Description</TableCell>
                                            <TableCell>Time</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {getAllWarnings().map((warning) => (
                                            <TableRow key={warning.id}>
                                                <TableCell>
                                                    <Chip
                                                        label={warning.area}
                                                        size="small"
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        {warning.type === 'error' ? (
                                                            <ErrorIcon color="error" fontSize="small" />
                                                        ) : (
                                                            <WarningIcon color="warning" fontSize="small" />
                                                        )}
                                                        <Typography variant="caption" color={warning.type === 'error' ? 'error' : 'warning'}>
                                                            {warning.type.toUpperCase()}
                                                        </Typography>
                                                    </Box>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {warning.title}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {warning.description}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {new Date(warning.timestamp).toLocaleString()}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        ) : (
                            <Box sx={{ textAlign: 'center', py: 4, backgroundColor: 'grey.50', borderRadius: 1 }}>
                                <CheckCircleIcon color="success" sx={{ fontSize: 48, mb: 2 }} />
                                <Typography variant="h6" color="success.main" gutterBottom>
                                    All Systems Healthy
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    No warnings or issues detected across all areas
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Collapse>
            </CardContent>
        </Card>
    );
};

export default DashboardStats;