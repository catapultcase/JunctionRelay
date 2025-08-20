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

import React, { useState, useEffect, useMemo, useCallback, memo } from "react";
import {
    Button,
    Typography,
    Box,
    CircularProgress,
    Chip,
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
    Tooltip,
    IconButton,
    Popover,
    List,
    ListItem,
    ListItemText,
    Checkbox,
    ToggleButtonGroup,
    ToggleButton,
    Card,
    CardContent,
    Divider,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
// Icon imports
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import RouterIcon from '@mui/icons-material/Router';
import ApiIcon from '@mui/icons-material/Api';
import { useTheme, useMediaQuery } from "@mui/material";

// Import sub-components
import ServiceCard from '../components/Services_ServiceCard';
import ServiceTableRow from '../components/Services_ServiceTableRow';
import AddServiceModal from '../components/Services_AddServiceModal';

// Types
type ViewMode = 'table' | 'standard' | 'mini';
type SortDirection = 'asc' | 'desc';

interface ServiceColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    sortable?: boolean;
}

// Storage keys
const STORAGE_KEY_SERVICES_COLUMNS = "services_visible_columns";
const STORAGE_KEY_SERVICES_SORT = "services_sort_state";
const STORAGE_KEY_SERVICES_VIEW_MODE = "junctionrelay_services_view_mode";

// Column definitions
const defaultServiceColumns: ServiceColumn[] = [
    { field: "actions", label: "Actions", align: "right", sortable: false },
    { field: "name", label: "Service Name", align: "left", sortable: true },
    { field: "type", label: "Type", align: "left", sortable: true },
    { field: "description", label: "Description", align: "left", sortable: true },
    { field: "uniqueIdentifier", label: "Unique Identifier", align: "left", sortable: true },
    { field: "status", label: "Status", align: "left", sortable: true },
];

// Default visible columns
const defaultVisibleColumns = ["name", "type", "description", "uniqueIdentifier", "status", "actions"];

// Helper function to get service type info with colors and icons
const getServiceTypeInfo = (type: string) => {
    const typeMap: Record<string, { color: "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error", icon: React.ReactNode }> = {
        "MQTT Broker": { color: "error", icon: <RouterIcon fontSize="small" /> },
        "HomeAssistant": { color: "success", icon: <DashboardIcon fontSize="small" /> },
        "Grafana": { color: "warning", icon: <ApiIcon fontSize="small" /> },
    };

    return typeMap[type] || { color: "default" as const, icon: <ApiIcon fontSize="small" /> };
};

// Main Services Component
const Services = () => {
    const [services, setServices] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [addServiceModalOpen, setAddServiceModalOpen] = useState(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    // View mode and table management state
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_SERVICES_VIEW_MODE);
        return (stored as ViewMode) || 'table';
    });

    const [visibleCols, setVisibleCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_SERVICES_COLUMNS);
        return stored ? JSON.parse(stored) : defaultVisibleColumns;
    });

    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_SERVICES_SORT);
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
        localStorage.setItem(STORAGE_KEY_SERVICES_VIEW_MODE, viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SERVICES_COLUMNS, JSON.stringify(visibleCols));
    }, [visibleCols]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_SERVICES_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Show snackbar with configurable severity
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

    const fetchServices = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/services");
            if (!response.ok) {
                throw new Error("Failed to fetch services");
            }
            const data = await response.json();
            setServices(data);
        } catch (err: any) {
            showSnackbar("Error fetching services", "error");
            console.error("Error fetching services:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchServices();
    }, []);

    // Listen for view mode changes from bottom action bar (mobile only) 
    useEffect(() => {
        const handleBottomActionViewModeChange = (e: CustomEvent) => {
            // Only respond to bottom action bar changes when in mobile mode
            if (isMobile && e.detail.mode) {
                const newMode = e.detail.mode as ViewMode;
                setViewMode(newMode);
                localStorage.setItem(STORAGE_KEY_SERVICES_VIEW_MODE, newMode);
            }
        };

        // Listen for localStorage changes from other tabs/windows
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY_SERVICES_VIEW_MODE && e.newValue) {
                const newMode = e.newValue as ViewMode;
                setViewMode(newMode);
            }
        };

        // Only listen for bottom action events on mobile
        if (isMobile) {
            window.addEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange as EventListener);
        }

        window.addEventListener('storage', handleStorageChange);

        return () => {
            if (isMobile) {
                window.removeEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange as EventListener);
            }
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [isMobile]);

    // Listen for bottom action bar events
    useEffect(() => {
        const handleAddService = () => {
            console.log('Bottom bar: Add service requested');
            setAddServiceModalOpen(true);
        };

        // Add event listener for bottom action bar
        window.addEventListener('bottom-action-add-service', handleAddService);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-add-service', handleAddService);
        };
    }, []);

    // Sort services
    const sortedServices = useMemo(() => {
        const { orderBy, order } = sortState;
        return [...services].sort((a, b) => {
            let valueA: any;
            let valueB: any;

            switch (orderBy) {
                case 'name':
                    valueA = a.name?.toLowerCase() || '';
                    valueB = b.name?.toLowerCase() || '';
                    break;
                case 'type':
                    valueA = a.type?.toLowerCase() || '';
                    valueB = b.type?.toLowerCase() || '';
                    break;
                case 'description':
                    valueA = a.description?.toLowerCase() || '';
                    valueB = b.description?.toLowerCase() || '';
                    break;
                case 'uniqueIdentifier':
                    valueA = a.uniqueIdentifier?.toLowerCase() || '';
                    valueB = b.uniqueIdentifier?.toLowerCase() || '';
                    break;
                case 'status':
                    valueA = a.status?.toLowerCase() || '';
                    valueB = b.status?.toLowerCase() || '';
                    break;
                default:
                    valueA = a[orderBy] || '';
                    valueB = b[orderBy] || '';
            }

            if (valueA < valueB) {
                return order === 'asc' ? -1 : 1;
            }
            if (valueA > valueB) {
                return order === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [services, sortState]);

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
    const handleAddService = () => {
        setAddServiceModalOpen(true);
    };

    const handleServiceAdded = () => {
        fetchServices();
        showSnackbar("Service added successfully", "success");
    };

    const handleServiceAddedAndConfigure = (serviceId: number) => {
        showSnackbar("Service added successfully. Redirecting to configuration...", "success");
        navigate(`/configure-service/${serviceId}`);
    };

    const handleDelete = async (e: React.MouseEvent, serviceId: number) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this service?")) {
            try {
                const response = await fetch(`/api/services/${serviceId}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    showSnackbar("Service deleted successfully", "success");
                    fetchServices();
                } else {
                    throw new Error("Failed to delete service");
                }
            } catch (err: unknown) {
                showSnackbar("Error deleting service", "error");
            }
        }
    };

    const handleEdit = (e: React.MouseEvent, service: any) => {
        e.stopPropagation();
        navigate(`/configure-service/${service.id}`);
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
            {/* Page Header - Hide on mobile */}
            {!isMobile && (
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Services Management
                </Typography>
            )}

            {/* Management Buttons - Hide on mobile since bottom action bar handles it */}
            {!isMobile && (
                <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleAddService}
                        size="small"
                        startIcon={<AddIcon />}
                    >
                        Add Service
                    </Button>
                </Box>
            )}

            {/* Table header with view mode toggle and column selector */}
            <Box display="flex" alignItems="center" mb={1} flexWrap="wrap" gap={2}>
                <Typography variant="h6">Services</Typography>

                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    {/* View Mode Toggle - ONLY show on desktop (hidden on mobile since it's in bottom bar) */}
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

                    {/* Columns Button - Only show in table view */}
                    {viewMode === 'table' && (
                        <Button
                            onClick={openColsPopover}
                            size="small"
                            variant="outlined"
                            sx={{
                                minWidth: 'auto',
                                textTransform: 'none',
                                fontWeight: 500,
                                fontSize: '0.875rem',
                                padding: '4px 10px',
                            }}
                        >
                            Columns
                        </Button>
                    )}
                </Box>

                {/* Columns Popover */}
                <Popover
                    open={Boolean(anchorCols)}
                    anchorEl={anchorCols}
                    onClose={closeColsPopover}
                >
                    <List dense>
                        {visibleCols.map((field, idx) => (
                            <ListItem key={field}>
                                <Checkbox
                                    checked
                                    onChange={(e) => {
                                        handleToggleColumn(field, e.target.checked);
                                    }}
                                />
                                <ListItemText primary={defaultServiceColumns.find((c) => c.field === field)!.label} />
                                <IconButton
                                    size="small"
                                    disabled={idx === 0}
                                    onClick={() => handleMoveColumn(field, "up")}
                                >
                                    <ArrowUpwardIcon fontSize="inherit" />
                                </IconButton>
                                <IconButton
                                    size="small"
                                    disabled={idx === visibleCols.length - 1}
                                    onClick={() => handleMoveColumn(field, "down")}
                                >
                                    <ArrowDownwardIcon fontSize="inherit" />
                                </IconButton>
                            </ListItem>
                        ))}
                        {defaultServiceColumns
                            .filter((c) => !visibleCols.includes(c.field))
                            .map(({ field, label }) => (
                                <ListItem key={field}>
                                    <Checkbox
                                        onChange={(e) => {
                                            handleToggleColumn(field, e.target.checked);
                                        }}
                                    />
                                    <ListItemText primary={label} />
                                </ListItem>
                            ))}
                    </List>
                </Popover>
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
                                    const colDef = defaultServiceColumns.find((c) => c.field === field)!;

                                    const getColumnWidth = (field: string) => {
                                        switch (field) {
                                            case "name":
                                                return { minWidth: 200, width: 'auto' };
                                            case "type":
                                                return { minWidth: 120, width: 120 };
                                            case "description":
                                                return { minWidth: 200, width: 'auto' };
                                            case "uniqueIdentifier":
                                                return { minWidth: 180, width: 'auto' };
                                            case "status":
                                                return { minWidth: 100, width: 100 };
                                            case "actions":
                                                return { minWidth: 120, width: 120 };
                                            default:
                                                return { minWidth: 120, width: 'auto' };
                                        }
                                    };

                                    const columnWidth = getColumnWidth(field);

                                    return (
                                        <TableCell
                                            key={field}
                                            align={colDef.align}
                                            sortDirection={sortState.orderBy === field ? sortState.order : false}
                                            sx={{
                                                ...columnWidth,
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
                            {sortedServices.length > 0 ? (
                                sortedServices.map((service) => (
                                    <ServiceTableRow
                                        key={service.id}
                                        service={service}
                                        visibleCols={visibleCols}
                                        allColumns={defaultServiceColumns}
                                        onDelete={handleDelete}
                                        onEdit={handleEdit}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={visibleCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">No services found</Typography>
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
                    {sortedServices.length > 0 ? (
                        sortedServices.map((service) => (
                            <ServiceCard
                                key={service.id}
                                service={service}
                                viewMode={viewMode as 'standard' | 'mini'}
                                onDelete={handleDelete}
                                onEdit={handleEdit}
                            />
                        ))
                    ) : (
                        <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                            <Typography color="textSecondary">No services found</Typography>
                        </Paper>
                    )}
                </Box>
            )}

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

            {/* Add Service Modal */}
            <AddServiceModal
                open={addServiceModalOpen}
                onClose={() => setAddServiceModalOpen(false)}
                onServiceAdded={handleServiceAdded}
                onServiceAddedAndConfigure={handleServiceAddedAndConfigure}
            />
        </Box>
    );
};

export default Services;