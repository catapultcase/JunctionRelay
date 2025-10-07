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

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    Typography,
    Box,
    CircularProgress,
    Snackbar,
    Alert,
    AlertColor,
    Button,
    Paper,
    Chip,
    Divider,
    IconButton,
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
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import AddIcon from '@mui/icons-material/Add';
import { useTheme, useMediaQuery } from "@mui/material";

// Import icons for stats
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

// Import the JunctionsTable component and its types
import JunctionsTable, { JunctionColumn, Junction } from "../components/JunctionsTable";
import AddJunctionModal from "../components/Junction_AddJunctionModal";
import DashboardSettings from '../components/Dashboard_Settings';
import ActiveCollectorsCard from '../components/Dashboard_ActiveCollectorsCard';
import ActiveStreamsCard from '../components/Dashboard_ActiveStreamsCard';

// Main Dashboard Component
const Dashboard = () => {
    const [junctions, setJunctions] = useState<Junction[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");
    const [detailedConnections, setDetailedConnections] = useState<boolean>(() => {
        const savedValue = localStorage.getItem('dashboard_detailed_connections');
        return savedValue !== null ? savedValue === 'true' : true;
    });

    // Junction creation state - simplified
    const [addJunctionModalOpen, setAddJunctionModalOpen] = useState<boolean>(false);

    // Removed drawer functionality - no longer needed

    // NEW: System Overview expansion state
    const [overviewExpanded, setOverviewExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem('dashboard_overview_expanded');
        return saved !== null ? saved === 'true' : false; // Default to collapsed
    });

    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Filter junctions to only show those with showOnDashboard: true
    const dashboardJunctions = useMemo(() => {
        return junctions.filter(junction => junction.showOnDashboard !== false);
    }, [junctions]);

    // Dashboard component does NOT include dashboard toggle column
    const additionalColumns: JunctionColumn[] = []; // Empty - no dashboard column

    // Add cleanup when navigating away from dashboard
    useEffect(() => {
        return () => {
            console.log('Dashboard unmounting - cleaning up resources');
            // Notify child components to cleanup
            window.dispatchEvent(new CustomEvent('dashboard-cleanup'));
        };
    }, []);

    // NEW: Bottom Action Bar event listeners
    useEffect(() => {
        const handleAddJunction = () => {
            console.log('Bottom bar: Add junction requested');
            handleAddJunctionClick();
        };

        const handleRefresh = () => {
            console.log('Bottom bar: Refresh requested');
            refreshJunctions();
        };

        // Add event listeners for bottom action bar
        window.addEventListener('bottom-action-add-junction', handleAddJunction);
        window.addEventListener('bottom-action-refresh', handleRefresh);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-add-junction', handleAddJunction);
            window.removeEventListener('bottom-action-refresh', handleRefresh);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty dependency array - refreshJunctions is stable

    // Persist overview expansion state
    useEffect(() => {
        localStorage.setItem('dashboard_overview_expanded', overviewExpanded.toString());
    }, [overviewExpanded]);

    // Show snackbar with configurable severity
    const showSnackbar = useCallback((message: string, severity: AlertColor = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    }, []);

    // Refresh only junction status - matches Dashboard pattern with smart comparison
    const refreshJunctionsStatus = useCallback(() => {
        fetch("/api/connections/running")
            .then((r) => r.json())
            .then((data: { id: number; status: string }[]) =>
                setJunctions((prev) => {
                    const updated = prev.map((j) => {
                        const upd = data.find((r) => r.id === j.id);
                        return upd && upd.status !== j.status ? { ...j, status: upd.status } : j;
                    });

                    if (JSON.stringify(updated) !== JSON.stringify(prev)) {
                        return updated;
                    }
                    return prev;
                })
            )
            .catch(console.error);
    }, []);

    // Refresh junctions data (for after add/clone/delete operations)
    const refreshJunctions = useCallback(async () => {
        try {
            const response = await fetch("/api/junctions");
            if (!response.ok) {
                throw new Error("Failed to fetch junctions");
            }
            const junctions = await response.json();

            // Add sortOrder if missing and sort the junctions
            const junctionsWithSortOrder = junctions.map((j: Junction, index: number) => {
                return { ...j, sortOrder: j.sortOrder !== undefined ? j.sortOrder : index };
            }).sort((a: Junction, b: Junction) => a.sortOrder - b.sortOrder);

            // Merge with current status data
            const runningResponse = await fetch("/api/connections/running");
            if (runningResponse.ok) {
                const runningData = await runningResponse.json();
                const updatedJunctions = junctionsWithSortOrder.map((j: Junction) => {
                    const running = runningData.find((r: any) => r.id === j.id);
                    return running ? { ...j, status: running.status } : j;
                });

                setJunctions(prev => {
                    if (JSON.stringify(updatedJunctions) !== JSON.stringify(prev)) {
                        return updatedJunctions;
                    }
                    return prev;
                });
            } else {
                setJunctions(prev => {
                    if (JSON.stringify(junctionsWithSortOrder) !== JSON.stringify(prev)) {
                        return junctionsWithSortOrder;
                    }
                    return prev;
                });
            }
        } catch (err: any) {
            showSnackbar("Error refreshing junctions", "error");
            console.error("Error refreshing junctions:", err);
        }
    }, [showSnackbar]);

    // Initial data loading with enhanced cleanup
    useEffect(() => {
        let mounted = true;
        let intervalId: number | null = null;

        const init = async () => {
            if (!mounted) return;

            try {
                setLoading(true);

                const junctionsResponse = await fetch("/api/junctions");
                if (!junctionsResponse.ok) {
                    throw new Error("Failed to fetch junctions");
                }
                const junctions = await junctionsResponse.json();

                if (!mounted) return; // Check again after async operation

                const runningResponse = await fetch("/api/connections/running");
                let runningData: { id: number; status: string }[] = [];
                if (runningResponse.ok) {
                    runningData = await runningResponse.json();
                }

                if (!mounted) return; // Check again after async operation

                const mergedJunctions = junctions.map((j: Junction, index: number) => {
                    const u = runningData.find((x: any) => x.id === j.id);
                    const sortOrder = j.sortOrder !== undefined ? j.sortOrder : index;
                    return u ? { ...j, status: u.status, sortOrder } : { ...j, sortOrder };
                });

                mergedJunctions.sort((a: Junction, b: Junction) => a.sortOrder - b.sortOrder);

                if (mounted) {
                    setJunctions(mergedJunctions);
                }

            } catch (err: any) {
                if (mounted) {
                    showSnackbar("Error fetching junctions", "error");
                    console.error("Error fetching junctions:", err);
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        init();

        intervalId = window.setInterval(() => {
            if (mounted) {
                refreshJunctionsStatus();
            }
        }, 1000);

        // Enhanced cleanup
        return () => {
            mounted = false;
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            console.log('Dashboard effect cleanup - clearing interval and marking unmounted');
        };
    }, [refreshJunctionsStatus, showSnackbar]);

    // Handle updating junction sort order
    const handleUpdateSortOrders = async (updates: { junctionId: number, sortOrder: number }[]) => {
        try {
            if (!updates || updates.length === 0) return;

            // Update local state only - no backend call needed
            setJunctions(prevJunctions => {
                const junctionMap = new Map(prevJunctions.map(j => [j.id, j]));

                updates.forEach(update => {
                    if (junctionMap.has(update.junctionId)) {
                        const junction = junctionMap.get(update.junctionId);
                        if (junction) {
                            junctionMap.set(update.junctionId, {
                                ...junction,
                                sortOrder: update.sortOrder
                            });
                        }
                    }
                });

                return Array.from(junctionMap.values())
                    .sort((a, b) => a.sortOrder - b.sortOrder);
            });

        } catch (error) {
            console.error("Failed to process sort orders:", error);
        }
    };

    // Junction action handlers
    const handleAutoStartToggle = useCallback(async (junctionId: number, autoStartOnLaunch: boolean) => {
        try {
            // Find the junction to update
            const junction = junctions.find(j => j.id === junctionId);
            if (!junction) {
                throw new Error("Junction not found");
            }

            const updatedJunction = {
                ...junction,
                autoStartOnLaunch: autoStartOnLaunch
            };

            const response = await fetch(`/api/junctions/${junctionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedJunction),
            });

            if (response.ok) {
                showSnackbar(`Junction auto-start ${autoStartOnLaunch ? 'enabled' : 'disabled'}`, "success");
                await refreshJunctions();
            } else {
                throw new Error("Failed to update junction");
            }
        } catch (err) {
            console.error("Auto-start toggle error:", err);
            showSnackbar("Error updating junction auto-start status", "error");
        }
    }, [junctions, showSnackbar, refreshJunctions]);

    const handleStartJunction = async (junctionId: number) => {
        try {
            const response = await fetch(`/api/connections/start/${junctionId}`, { method: "POST" });
            if (response.ok) {
                showSnackbar("Junction started successfully", "success");
                setJunctions(prev =>
                    prev.map(j =>
                        j.id === junctionId ? { ...j, status: "Running" } : j
                    )
                );
            } else {
                throw new Error("Failed to start junction");
            }
        } catch (err) {
            showSnackbar("Error starting junction", "error");
        }
    };

    const handleStopJunction = async (junctionId: number) => {
        try {
            const response = await fetch(`/api/connections/stop/${junctionId}`, { method: "POST" });
            if (response.ok) {
                showSnackbar("Junction stopped successfully", "success");
                setJunctions(prev =>
                    prev.map(j =>
                        j.id === junctionId ? { ...j, status: "Idle" } : j
                    )
                );
            } else {
                throw new Error("Failed to stop junction");
            }
        } catch (err) {
            showSnackbar("Error stopping junction", "error");
        }
    };

    const handleCloneJunction = async (junctionId: number) => {
        try {
            const response = await fetch(`/api/junctions/${junctionId}/clone`, {
                method: "POST"
            });

            if (!response.ok) {
                throw new Error("Failed to clone junction");
            }

            const cloned = await response.json();
            showSnackbar(`Cloned "${cloned.name}" successfully`, "success");
            await refreshJunctions();
        } catch (err) {
            console.error("Clone failed:", err);
            showSnackbar("Error cloning junction", "error");
        }
    };

    const handleDeleteJunction = async (junctionId: number) => {
        try {
            const response = await fetch(`/api/junctions/${junctionId}`, {
                method: "DELETE"
            });

            if (response.ok) {
                showSnackbar("Junction deleted successfully", "success");
                await refreshJunctions();
            } else {
                throw new Error("Failed to delete junction");
            }
        } catch (err) {
            showSnackbar("Error deleting junction", "error");
        }
    };

    // Junction creation handlers - simplified
    const handleAddJunctionClick = () => {
        setAddJunctionModalOpen(true);
    };

    const handleJunctionAdded = async (id: number, redirect: boolean) => {
        await refreshJunctions();
        showSnackbar("Junction added successfully", "success");

        if (redirect) {
            navigate(`/configure-junction/${id}`);
        }
    };

    const [collectorsExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem('dashboard_collectors_expanded');
        return saved !== null ? saved === 'true' : true;
    });

    const [streamsExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem('dashboard_streams_expanded');
        return saved !== null ? saved === 'true' : true;
    });

    const [junctionsExpanded, setJunctionsExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem('dashboard_junctions_expanded');
        return saved !== null ? saved === 'true' : true;
    });

    // Persist junctions expansion state
    useEffect(() => {
        localStorage.setItem('dashboard_junctions_expanded', junctionsExpanded.toString());
    }, [junctionsExpanded]);

    // NEW: Calculate stats from junctions data (placeholder logic)
    const dashboardStats = useMemo(() => {
        const activeJunctions = junctions.filter(j => j.status === 'Running').length;

        // Mockup values as requested
        const activeCollectors = 8;
        const activeStreams = 15;
        const activeSensors = 342;

        return {
            junctions: {
                active: activeJunctions,
                health: { status: 'All Healthy', severity: 'success' as const },
                hasIssues: false,
                details: []
            },
            collectors: {
                active: activeCollectors,
                health: { status: '2 Unhealthy', severity: 'warning' as const },
                hasIssues: true,
                details: [
                    {
                        id: 1,
                        type: 'error',
                        title: 'Collector ABC failed test',
                        description: 'Last test failed at 7/12/2023 8:00 PM',
                        timestamp: '2023-07-12T20:00:00Z',
                        area: 'collectors'
                    },
                    {
                        id: 2,
                        type: 'warning',
                        title: 'Junction DEF collector issues',
                        description: '1 collector reporting faults',
                        timestamp: '2023-07-12T19:45:00Z',
                        area: 'collectors'
                    }
                ]
            },
            streams: {
                active: activeStreams,
                health: { status: 'Critical Errors', severity: 'error' as const },
                hasIssues: true,
                details: [
                    {
                        id: 3,
                        type: 'error',
                        title: 'Stream GHI connection failed',
                        description: 'Total connection loss - service unavailable',
                        timestamp: '2023-07-12T19:30:00Z',
                        area: 'streams'
                    },
                    {
                        id: 4,
                        type: 'error',
                        title: 'Stream XYZ data corruption',
                        description: 'Corrupted data packets detected',
                        timestamp: '2023-07-12T19:15:00Z',
                        area: 'streams'
                    }
                ]
            },
            sensors: {
                active: activeSensors,
                health: { status: 'All Healthy', severity: 'success' as const },
                hasIssues: false,
                details: []
            }
        };
    }, [junctions]);

    // NEW: Get all warnings grouped by area
    const getAllWarnings = () => {
        const allWarnings: any[] = [];

        Object.entries(dashboardStats).forEach(([area, data]) => {
            if (data.hasIssues && data.details) {
                data.details.forEach((detail: any) => {
                    allWarnings.push({
                        ...detail,
                        area: area.charAt(0).toUpperCase() + area.slice(1)
                    });
                });
            }
        });

        // Sort by timestamp (most recent first)
        return allWarnings.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    };

    // System Overview Card Component
    const renderSystemOverviewCard = () => (
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
                            <WarningIcon sx={{ color: 'warning.main', fontSize: 20 }} />
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
                            <ErrorIcon sx={{ color: 'error.main', fontSize: 20 }} />
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
                            <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20 }} />
                            <Chip
                                label={dashboardStats.sensors.health.status}
                                color={dashboardStats.sensors.health.severity}
                                size="small"
                                variant="outlined"
                            />
                        </Box>
                    </Box>
                </Box>

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
    

    return (
        <Box sx={{ padding: 2 }}>
            {/* NEW: System Overview Card */}
            {renderSystemOverviewCard()}

            {/* Junction Management Card - matches ActiveCollectors/Streams pattern */}
            <Card sx={{ mb: 3 }}>
                <CardHeader
                    title={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <AccountTreeIcon color="primary" />
                            <Typography variant="h6">
                                Junction Management
                            </Typography>
                        </Box>
                    }
                    action={
                        <IconButton onClick={() => setJunctionsExpanded(!junctionsExpanded)} size="small">
                            {junctionsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                    }
                    sx={{
                        cursor: 'pointer',
                        pb: junctionsExpanded ? 1 : 2,
                        '&:hover': { backgroundColor: 'action.hover' }
                    }}
                    onClick={() => setJunctionsExpanded(!junctionsExpanded)}
                />

                <Collapse in={junctionsExpanded}>
                    {junctionsExpanded && (
                        <CardContent sx={{ pt: 0 }}>
                            {/* Junction Management Buttons - only show on desktop */}
                            {!isMobile && (
                                <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                                    <Button
                                        variant="contained"
                                        color="primary"
                                        onClick={handleAddJunctionClick}
                                        size="small"
                                        startIcon={<AddIcon />}
                                        data-testid="add-junction-button"
                                    >
                                        Add Junction
                                    </Button>
                                </Box>
                            )}

                            {/* Junctions Table */}
                            {loading && junctions.length === 0 ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                                    <CircularProgress size={24} />
                                </Box>
                            ) : (
                                <JunctionsTable
                                    junctions={junctions}
                                    filteredJunctions={dashboardJunctions}
                                    additionalColumns={additionalColumns}
                                    onStartJunction={handleStartJunction}
                                    onStopJunction={handleStopJunction}
                                    onCloneJunction={handleCloneJunction}
                                    onDeleteJunction={handleDeleteJunction}
                                    onUpdateSortOrders={handleUpdateSortOrders}
                                    onJunctionAdded={refreshJunctions}
                                    onAutoStartToggle={handleAutoStartToggle}
                                    detailedConnections={detailedConnections}
                                    setDetailedConnections={setDetailedConnections}
                                    localStorageKey="dashboard_visible_junction_cols"
                                    title="Junctions"
                                    showAddButton={false}
                                    showImportButton={false}
                                    viewModeStorageKey="dashboard_junctions_view_mode"
                                    showRunningOnlyStorageKey="dashboard_show_running_only"
                                    detailedConnectionsStorageKey="dashboard_detailed_connections"
                                />
                            )}
                        </CardContent>
                    )}
                </Collapse>
            </Card>

            {/* NEW: Unified Dashboard Settings - replaces SharedWebSocketSettings */}
            <DashboardSettings
                enabled={true}
                defaultExpanded={false}
                storageKey="dashboard_unified_settings_expanded"
                showAsCard={true}
            />

            {/* UPDATED: Simplified Active Collectors Card */}
            <ActiveCollectorsCard
                defaultExpanded={collectorsExpanded}
                storageKey="dashboard_collectors_expanded"
            />

            {/* UPDATED: Simplified Active Streams Card */}
            <ActiveStreamsCard
                defaultExpanded={streamsExpanded}
                storageKey="dashboard_streams_expanded"
            />

            {/* Add Junction Modal */}
            <AddJunctionModal
                open={addJunctionModalOpen}
                onClose={() => setAddJunctionModalOpen(false)}
                onJunctionAdded={handleJunctionAdded}
                junctions={junctions}
            />

            {/* Snackbar for notifications */}
            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={6000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackMessage(null)}
                    severity={snackbarSeverity}
                    sx={{ width: "100%" }}
                >
                    {snackMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default Dashboard;