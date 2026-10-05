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

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Typography,
    Box,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Paper,
    Snackbar,
    Alert,
    IconButton,
    Popover,
    Checkbox,
    ToggleButtonGroup,
    ToggleButton,
    Tabs,
    Tab,
    Divider,
    FormControlLabel,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
// Icon imports
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import { useTheme, useMediaQuery } from "@mui/material";
import { usePageTitle } from '../hooks/usePageTitle';

// Import sub-components
import XSDCard from '../components/XSD_Card';
import XSDTableRow from '../components/XSD_TableRow';
import DeviceAddXSDModal from '../components/Device_AddXSDModal';
import XSDManagementSection from '../components/XSD_ManagementSection';
import TransitionRulesEditor from '../components/TransitionRulesEditor';
import type { Device, FrameLayoutSummary } from '../types/entities';
import type { ViewMode } from '../types/devices';
import { isViewMode } from '../types/payloads';

// Types
type SortDirection = 'asc' | 'desc';

interface XSDColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    sortable?: boolean;
}

// Storage keys
const STORAGE_KEY_XSD_COLUMNS = "xsds_visible_columns";
const STORAGE_KEY_XSD_SORT = "xsds_sort_state";
const STORAGE_KEY_XSD_VIEW_MODE = "junctionrelay_xsds_view_mode";

// Column definitions
const defaultXSDColumns: XSDColumn[] = [
    { field: "actions", label: "Actions", align: "right", sortable: false },
    { field: "name", label: "Device Name", align: "left", sortable: true },
    { field: "ipAddress", label: "IP Address", align: "left", sortable: true },
    { field: "port", label: "Port", align: "left", sortable: true },
    { field: "status", label: "Status", align: "left", sortable: true },
    { field: "lastHeartbeat", label: "Last Heartbeat", align: "left", sortable: true },
];

// Default visible columns
const defaultVisibleColumns = ["name", "ipAddress", "port", "status", "lastHeartbeat", "actions"];

// Main XSDs Component
const XSD = () => {
    usePageTitle('XSD');

    const [xsdDevices, setXSDs] = useState<Device[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");
    const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState(0);
    const [availableLayouts, setAvailableLayouts] = useState<Array<{ path: string; name: string; source: 'user' | 'bundled' | 'subscribed' }>>([]);

    // View mode and table management state
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_XSD_VIEW_MODE);
        return isViewMode(stored) ? stored : 'table';
    });

    const [visibleCols, setVisibleCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_XSD_COLUMNS);
        return stored ? JSON.parse(stored) : defaultVisibleColumns;
    });

    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_XSD_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'name', order: 'asc' };
        } catch (e) {
            return { orderBy: 'name', order: 'asc' };
        }
    });

    // Popover anchor for column management
    const [anchorCols, setAnchorCols] = useState<HTMLElement | null>(null);

    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Persist states
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_XSD_VIEW_MODE, viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_XSD_COLUMNS, JSON.stringify(visibleCols));
    }, [visibleCols]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_XSD_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Show snackbar with configurable severity
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

    const fetchXSDs = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/xsd");
            if (!response.ok) {
                throw new Error("Failed to fetch virtual devices");
            }
            const data = await response.json();
            setXSDs(data);
        } catch (err) {
            showSnackbar("Error fetching virtual devices", "error");
            console.error("Error fetching virtual devices:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchXSDs();
    }, []);

    // Fetch available layouts for transition rules
    useEffect(() => {
        const fetchLayouts = async () => {
            try {
                // The layout list is GET /api/frameengine (there is no /layouts list route);
                // a layout's "path" for the transition rules is its id
                const response = await fetch('/api/frameengine');
                if (response.ok) {
                    const data: FrameLayoutSummary[] = await response.json();
                    setAvailableLayouts(data.map((layout) => ({
                        path: layout.id,
                        name: layout.displayName || layout.id,
                        source: 'user' as const
                    })));
                }
            } catch (err) {
                console.error('Error fetching layouts:', err);
            }
        };
        fetchLayouts();
    }, []);

    // Sort virtual devices
    const sortedXSDs = useMemo(() => {
        const { orderBy, order } = sortState;
        return [...xsdDevices].sort((a, b) => {
            let valueA: string | number;
            let valueB: string | number;

            switch (orderBy) {
                case 'name':
                    valueA = a.name?.toLowerCase() || '';
                    valueB = b.name?.toLowerCase() || '';
                    break;
                case 'ipAddress':
                    valueA = a.ipAddress?.toLowerCase() || '';
                    valueB = b.ipAddress?.toLowerCase() || '';
                    break;
                case 'port':
                    valueA = a.webSocketPort || 0;
                    valueB = b.webSocketPort || 0;
                    break;
                case 'status':
                    valueA = a.status?.toLowerCase() || '';
                    valueB = b.status?.toLowerCase() || '';
                    break;
                default:
                    valueA = '';
                    valueB = '';
            }

            if (valueA < valueB) {
                return order === 'asc' ? -1 : 1;
            }
            if (valueA > valueB) {
                return order === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [xsdDevices, sortState]);

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

    // Event handlers
    const handleDelete = async (e: React.MouseEvent, deviceId: number) => {
        e.stopPropagation();

        if (window.confirm("Are you sure you want to delete this XSD Instance?")) {
            try {
                const response = await fetch(`/api/xsd/${deviceId}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    showSnackbar("XSD Instance deleted successfully", "success");
                    fetchXSDs();
                } else {
                    throw new Error("Failed to delete XSD Instance");
                }
            } catch (err: unknown) {
                showSnackbar("Error deleting XSD Instance", "error");
            }
        }
    };

    const handleEdit = (e: React.MouseEvent, device: Device) => {
        e.stopPropagation();
        navigate(`/xsd/${device.id}/configure`);
    };

    const handleCardClick = (device: Device) => {
        navigate(`/xsd/${device.id}/configure`);
    };

    // View mode change handler
    const handleViewModeChange = useCallback((event: React.MouseEvent<HTMLElement>, newViewMode: ViewMode) => {
        if (newViewMode !== null) {
            setViewMode(newViewMode);
        }
    }, []);

    // Sort handler
    const handleRequestSort = useCallback((property: string) => {
        const isAsc = sortState.orderBy === property && sortState.order === 'asc';
        setSortState({
            orderBy: property,
            order: isAsc ? 'desc' : 'asc'
        });
    }, [sortState]);

    // Column management handlers
    const openColsPopover = useCallback((e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        setAnchorCols(e.currentTarget);
    }, []);

    const closeColsPopover = useCallback(() => setAnchorCols(null), []);

    const handleToggleColumn = useCallback((field: string, checked: boolean) => {
        if (checked) {
            setVisibleCols(prev => [...prev, field]);
        } else {
            setVisibleCols(prev => prev.filter(f => f !== field));
        }
    }, []);

    const moveCol = useCallback((field: string, direction: "up" | "down") => {
        const list = visibleCols;
        const i = list.indexOf(field);
        if (i < 0) return;
        const j = direction === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        const copy = [...list];
        copy.splice(i, 1);
        copy.splice(j, 0, field);
        setVisibleCols(copy);
    }, [visibleCols]);

    const handleMoveColumn = useCallback((field: string, direction: "up" | "down") => {
        moveCol(field, direction);
    }, [moveCol]);

    return (
        <Box sx={{ padding: 2 }}>
            {/* XSD Management Section - Hide on mobile */}
            <XSDManagementSection
                isMobile={isMobile}
                setAddModalOpen={setAddModalOpen}
            />

            {/* Tabbed Content */}
            <Paper sx={{ p: 2 }}>
                <Tabs
                    value={activeTab}
                    onChange={(_, newValue) => setActiveTab(newValue)}
                    sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab label="Instances" />
                    <Tab label="Global Transition Rules" />
                </Tabs>

                {/* Instances Tab */}
                {activeTab === 0 && (
                    <Box sx={{ px: 1 }}>
                        {/* Table header with view mode toggle and column selector */}
                        <Box display="flex" alignItems="center" mb={1} flexWrap="wrap" gap={2}>
                <Typography variant="h6">XSD Instances</Typography>

                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                    {/* Column settings cog - Only show in table view, positioned LEFT of view toggle */}
                    {viewMode === 'table' && (
                        <>
                            <IconButton
                                size="small"
                                onClick={openColsPopover}
                            >
                                <SettingsIcon fontSize="small" />
                            </IconButton>
                            <Popover
                                open={Boolean(anchorCols)}
                                anchorEl={anchorCols}
                                onClose={closeColsPopover}
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                            >
                                <Box sx={{ p: 2, minWidth: 200 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Columns</Typography>
                                    <Divider sx={{ mb: 1 }} />
                                    {visibleCols.map((field, idx) => (
                                        <Box key={field} sx={{ display: 'flex', alignItems: 'center' }}>
                                            <FormControlLabel
                                                control={
                                                    <Checkbox
                                                        checked
                                                        onChange={(e) => handleToggleColumn(field, e.target.checked)}
                                                        size="small"
                                                    />
                                                }
                                                label={<Typography variant="body2">{defaultXSDColumns.find((c) => c.field === field)?.label ?? field}</Typography>}
                                                sx={{ flex: 1, m: 0 }}
                                            />
                                            <IconButton
                                                size="small"
                                                onClick={() => handleMoveColumn(field, "up")}
                                                disabled={idx === 0}
                                            >
                                                <ArrowUpwardIcon fontSize="small" />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleMoveColumn(field, "down")}
                                                disabled={idx === visibleCols.length - 1}
                                            >
                                                <ArrowDownwardIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    ))}
                                    {defaultXSDColumns
                                        .filter((c) => !visibleCols.includes(c.field))
                                        .map(({ field, label }) => (
                                            <Box key={field} sx={{ display: 'flex', alignItems: 'center' }}>
                                                <FormControlLabel
                                                    control={
                                                        <Checkbox
                                                            onChange={(e) => handleToggleColumn(field, e.target.checked)}
                                                            size="small"
                                                        />
                                                    }
                                                    label={<Typography variant="body2">{label}</Typography>}
                                                    sx={{ flex: 1, m: 0 }}
                                                />
                                            </Box>
                                        ))}
                                </Box>
                            </Popover>
                        </>
                    )}

                    {/* View Mode Toggle - ONLY show on desktop */}
                    {!isMobile && (
                        <ToggleButtonGroup
                            value={viewMode}
                            exclusive
                            onChange={handleViewModeChange}
                            aria-label="view mode"
                            size="small"
                        >
                            <ToggleButton value="table" aria-label="table view">
                                <TableViewIcon />
                                <Typography variant="caption" sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>
                                    Table
                                </Typography>
                            </ToggleButton>
                            <ToggleButton value="standard" aria-label="standard tiles">
                                <DashboardIcon />
                                <Typography variant="caption" sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>
                                    Standard
                                </Typography>
                            </ToggleButton>
                            <ToggleButton value="mini" aria-label="mini tiles">
                                <ViewModuleIcon />
                                <Typography variant="caption" sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>
                                    Mini
                                </Typography>
                            </ToggleButton>
                        </ToggleButtonGroup>
                    )}
                </Box>
            </Box>

            {/* Render based on view mode */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : viewMode === 'table' ? (
                /* Table View */
                <TableContainer component={Paper} sx={{ mb: 4 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                {visibleCols.map((field) => {
                                    const colDef = defaultXSDColumns.find((c) => c.field === field);
                                    if (!colDef) return null;

                                    return (
                                        <TableCell
                                            key={field}
                                            align={colDef.align}
                                            sortDirection={sortState.orderBy === field ? sortState.order : false}
                                            sx={{
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                padding: '8px 16px'
                                            }}
                                        >
                                            {colDef.sortable !== false ? (
                                                <TableSortLabel
                                                    active={sortState.orderBy === field}
                                                    direction={sortState.orderBy === field ? sortState.order : 'asc'}
                                                    onClick={() => handleRequestSort(field)}
                                                >
                                                    {colDef.label}
                                                </TableSortLabel>
                                            ) : (
                                                colDef.label
                                            )}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sortedXSDs.length > 0 ? (
                                sortedXSDs.map((device) => (
                                    <XSDTableRow
                                        key={device.id}
                                        device={device}
                                        visibleCols={visibleCols}
                                        allColumns={defaultXSDColumns}
                                        onDelete={handleDelete}
                                        onEdit={handleEdit}
                                        onCardClick={() => handleCardClick(device)}
                                        id={`xsd-${device.id}`}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={visibleCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">No XSD Instances found</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : (
                /* Tile Views */
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: getGridColumns(),
                    gap: viewMode === 'mini' ? 1 : 2,
                    mb: 4
                }}>
                    {sortedXSDs.length > 0 ? (
                        sortedXSDs.map((device) => (
                            <Box key={device.id} id={`xsd-${device.id}`}>
                                <XSDCard
                                    device={device}
                                    viewMode={viewMode === 'mini' ? 'mini' : 'standard'}
                                    onDelete={handleDelete}
                                    onEdit={handleEdit}
                                    onCardClick={() => handleCardClick(device)}
                                />
                            </Box>
                        ))
                    ) : (
                        <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                            <Typography color="textSecondary">No XSD Instances found</Typography>
                        </Paper>
                    )}
                </Box>
                        )}
                    </Box>
                )}

                {/* Global Transitions Tab */}
                {activeTab === 1 && (
                    <Box sx={{ px: 1 }}>
                        <TransitionRulesEditor availableLayouts={availableLayouts} />
                    </Box>
                )}
            </Paper>

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

            {/* Add XSD Modal */}
            <DeviceAddXSDModal
                open={addModalOpen}
                onClose={() => setAddModalOpen(false)}
                onDeviceAdded={() => {
                    fetchXSDs();
                    showSnackbar("XSD Instance added successfully", "success");
                }}
            />
        </Box>
    );
};

export default XSD;
