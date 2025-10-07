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
    Button,
    Card,
    CardContent,
    CircularProgress,
    Paper,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Tooltip,
    IconButton,
    Popover,
    List,
    ListItem,
    ListItemText,
    Checkbox,
    ToggleButtonGroup,
    ToggleButton,
    Switch,
    AlertColor,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    InputAdornment,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useTheme, useMediaQuery } from "@mui/material";

// Icon imports
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EventIcon from '@mui/icons-material/Event';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SearchIcon from '@mui/icons-material/Search';

// WebSocket hook import
import { useEventRulesCacheWebSocket, SENSOR_CACHE_POLL_RATE_PRESETS, SENSOR_CACHE_POLL_RATE_LABELS, EventRuleData } from '../hooks/useGlobalSensorCacheWebSocket';

// Types
type ViewMode = 'table' | 'standard' | 'mini';
type SortDirection = 'asc' | 'desc';

interface EventEngineColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    sortable?: boolean;
}

// Props interface
interface EventEngineEventRulesProps {
    showSnackbar: (message: string, severity?: AlertColor) => void;
}

// Storage keys
const STORAGE_KEY_EVENTS_COLUMNS = "eventengine_events_visible_columns";
const STORAGE_KEY_EVENTS_SORT = "eventengine_events_sort_state";
const STORAGE_KEY_EVENTS_VIEW_MODE = "eventengine_events_view_mode";
const STORAGE_KEY_EVENTS_EXPANDED = "eventengine_events_expanded";

// Column definitions
const defaultEventColumns: EventEngineColumn[] = [
    { field: "actions", label: "Actions", align: "right", sortable: false },
    { field: "enabled", label: "Enabled", align: "center", sortable: true },
    { field: "name", label: "Event Name", align: "left", sortable: true },
    { field: "description", label: "Description", align: "left", sortable: true },
    { field: "triggerLogic", label: "Trigger Logic", align: "center", sortable: true },
    { field: "triggerCount", label: "# Triggers", align: "center", sortable: true },
    { field: "actionCount", label: "# Actions", align: "center", sortable: true },
    { field: "lastTriggered", label: "Last Triggered", align: "left", sortable: true },
    { field: "executionCount", label: "Executions", align: "center", sortable: true },
];

// Default visible columns
const defaultVisibleColumns = ["enabled", "name", "description", "triggerLogic", "triggerCount", "actionCount", "lastTriggered", "executionCount", "actions"];

// Connection status indicator helper
const getConnectionStatusChip = (connectionStatus: string, isConnected: boolean) => {
    const statusConfig = {
        connected: { color: 'success' as const, icon: <CheckCircleIcon sx={{ fontSize: '0.8rem' }} />, label: 'Connected' },
        connecting: { color: 'warning' as const, icon: <CircularProgress size={12} />, label: 'Connecting...' },
        disconnected: { color: 'error' as const, icon: <ErrorIcon sx={{ fontSize: '0.8rem' }} />, label: 'Disconnected' },
        error: { color: 'error' as const, icon: <ErrorIcon sx={{ fontSize: '0.8rem' }} />, label: 'Error' },
        disabled: { color: 'default' as const, icon: <ErrorIcon sx={{ fontSize: '0.8rem' }} />, label: 'Disabled' }
    };

    const config = statusConfig[connectionStatus as keyof typeof statusConfig] || statusConfig.disconnected;

    return (
        <Chip
            size="small"
            label={config.label}
            color={config.color}
            icon={config.icon}
            sx={{ fontSize: '0.75rem' }}
        />
    );
};

// Main component
const EventEngineEventRules: React.FC<EventEngineEventRulesProps> = ({
    showSnackbar
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const navigate = useNavigate();

    // WebSocket hook for real-time event rules data
    const {
        eventRules,
        connectionStatus,
        isConnected,
        lastUpdate,
        currentPollRate,
        setPollRate,
    } = useEventRulesCacheWebSocket({
        defaultPollRate: 500
    });

    // Search state
    const [searchTerm, setSearchTerm] = useState('');

    // Accordion state
    const [expanded, setExpanded] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY_EVENTS_EXPANDED);
            return saved !== null ? saved === 'true' : true;
        } catch (error) {
            console.error("Error accessing localStorage for events expansion:", error);
            return true;
        }
    });

    // View mode and table management state
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_EVENTS_VIEW_MODE);
        return (stored as ViewMode) || 'table';
    });

    const [visibleCols, setVisibleCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_EVENTS_COLUMNS);
        return stored ? JSON.parse(stored) : defaultVisibleColumns;
    });

    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_EVENTS_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'name', order: 'asc' };
        } catch (e) {
            return { orderBy: 'name', order: 'asc' };
        }
    });

    // Popover anchor for column management
    const [anchorCols, setAnchorCols] = useState<HTMLElement | null>(null);

    // Persist states
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_EVENTS_EXPANDED, expanded.toString());
    }, [expanded]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_EVENTS_VIEW_MODE, viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_EVENTS_COLUMNS, JSON.stringify(visibleCols));
    }, [visibleCols]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_EVENTS_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Listen for bottom action bar events
    useEffect(() => {
        const handleAddEvent = () => {
            navigate('/configure-eventrule/new');
        };

        const handleBottomActionViewModeChange = (e: CustomEvent) => {
            if (isMobile && e.detail.mode) {
                const newMode = e.detail.mode as ViewMode;
                setViewMode(newMode);
                localStorage.setItem(STORAGE_KEY_EVENTS_VIEW_MODE, newMode);
            }
        };

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY_EVENTS_VIEW_MODE && e.newValue) {
                const newMode = e.newValue as ViewMode;
                setViewMode(newMode);
            }
        };

        window.addEventListener('bottom-action-add-event', handleAddEvent);

        if (isMobile) {
            window.addEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange as EventListener);
        }

        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('bottom-action-add-event', handleAddEvent);

            if (isMobile) {
                window.removeEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange as EventListener);
            }

            window.removeEventListener('storage', handleStorageChange);
        };
    }, [isMobile, navigate]);

    // Filter events based on search term
    const filteredEvents = useMemo(() => {
        if (!searchTerm.trim()) {
            return eventRules;
        }

        const term = searchTerm.toLowerCase();
        return eventRules.filter(event => {
            return (
                event.name.toLowerCase().includes(term) ||
                event.description?.toLowerCase().includes(term) ||
                event.triggerLogic.toLowerCase().includes(term)
            );
        });
    }, [eventRules, searchTerm]);

    // Sort events
    const sortedEvents = useMemo(() => {
        const { orderBy, order } = sortState;
        return [...filteredEvents].sort((a, b) => {
            let valueA: any;
            let valueB: any;

            switch (orderBy) {
                case 'name':
                case 'description':
                case 'lastTriggered':
                case 'triggerLogic':
                    valueA = a[orderBy as keyof EventRuleData]?.toString()?.toLowerCase() || '';
                    valueB = b[orderBy as keyof EventRuleData]?.toString()?.toLowerCase() || '';
                    break;
                case 'enabled':
                    valueA = a.enabled ? 1 : 0;
                    valueB = b.enabled ? 1 : 0;
                    break;
                case 'triggerCount':
                    valueA = a.triggers?.length || 0;
                    valueB = b.triggers?.length || 0;
                    break;
                case 'actionCount':
                    valueA = a.actions?.length || 0;
                    valueB = b.actions?.length || 0;
                    break;
                case 'executionCount':
                    valueA = a.triggerCount || 0;
                    valueB = b.triggerCount || 0;
                    break;
                default:
                    valueA = a[orderBy as keyof EventRuleData] || '';
                    valueB = b[orderBy as keyof EventRuleData] || '';
            }

            if (valueA < valueB) {
                return order === 'asc' ? -1 : 1;
            }
            if (valueA > valueB) {
                return order === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [filteredEvents, sortState]);

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
    const handleAccordionChange = (isExpanded: boolean) => {
        setExpanded(isExpanded);
    };

    const handleAddEvent = () => {
        navigate('/configure-eventrule/new');
    };

    const handleEditEvent = (eventId: number) => {
        navigate(`/configure-eventrule/${eventId}`);
    };

    const handleDelete = async (eventId: number) => {
        if (window.confirm("Are you sure you want to delete this event?")) {
            try {
                const response = await fetch(`/api/eventrules/${eventId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                showSnackbar("Event deleted successfully", "success");
            } catch (error) {
                console.error("Error deleting event:", error);
                showSnackbar("Failed to delete event", "error");
            }
        }
    };

    const handleEventToggle = async (eventId: number, enabled: boolean) => {
        try {
            const response = await fetch(`/api/eventrules/${eventId}/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled }),
            });

            if (response.ok) {
                showSnackbar(`Event ${enabled ? 'enabled' : 'disabled'} successfully`, 'success');
            } else {
                showSnackbar('Failed to toggle event', 'error');
            }
        } catch (error) {
            console.error('Error toggling event:', error);
            showSnackbar('Error toggling event', 'error');
        }
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
        <Accordion
            expanded={expanded}
            onChange={(_, isExpanded) => handleAccordionChange(isExpanded)}
            sx={{ mb: 3 }}
        >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center" gap={1}>
                    <EventIcon color="primary" />
                    <Typography variant="h6">
                        Event Rules ({eventRules.length})
                    </Typography>
                    {getConnectionStatusChip(connectionStatus, isConnected)}
                </Box>
            </AccordionSummary>
            <AccordionDetails>
                <Box>
                    <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                        Configure event rules to automate actions based on sensor triggers. Events can update event sensors, publish MQTT messages, make HTTP requests, or control junctions.
                    </Typography>

                    {lastUpdate > 0 && (
                        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                            <Typography variant="caption" color="textSecondary" sx={{ alignSelf: 'center', ml: 'auto' }}>
                                Last update: {new Date(lastUpdate).toLocaleTimeString()}
                            </Typography>
                        </Box>
                    )}

                    {/* Management Buttons - Hide on mobile */}
                    {!isMobile && (
                        <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: 'wrap' }}>
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={handleAddEvent}
                                size="small"
                                startIcon={<AddIcon />}
                                disabled={!isConnected}
                            >
                                Add Event
                            </Button>
                        </Box>
                    )}

                    {/* Controls Bar */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                        <TextField
                            size="small"
                            placeholder="Search events..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ fontSize: '1rem' }} />
                                    </InputAdornment>
                                )
                            }}
                            sx={{ maxWidth: 300 }}
                        />

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                                <InputLabel>Poll Rate</InputLabel>
                                <Select
                                    value={currentPollRate}
                                    onChange={(e) => setPollRate(Number(e.target.value))}
                                    label="Poll Rate"
                                    disabled={!isConnected}
                                >
                                    {Object.entries(SENSOR_CACHE_POLL_RATE_PRESETS).map(([key, value]) => (
                                        <MenuItem key={key} value={value}>
                                            {SENSOR_CACHE_POLL_RATE_LABELS[value]}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

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
                                {visibleCols.map((field, idx) => {
                                    const colDef = defaultEventColumns.find((c) => c.field === field);
                                    if (!colDef) return null;

                                    return (
                                        <ListItem key={field}>
                                            <Checkbox
                                                checked
                                                onChange={(e) => {
                                                    handleToggleColumn(field, e.target.checked);
                                                }}
                                            />
                                            <ListItemText primary={colDef.label} />
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
                                    );
                                })}
                                {defaultEventColumns
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
                    {!isConnected ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
                            <Box sx={{ textAlign: 'center' }}>
                                <CircularProgress sx={{ mb: 2 }} />
                                <Typography variant="body2" color="textSecondary">
                                    {connectionStatus === 'connecting' ? 'Connecting to event rules cache...' : 'Not connected to event rules cache'}
                                </Typography>
                            </Box>
                        </Box>
                    ) : viewMode === 'table' ? (
                        /* Table View */
                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                        {visibleCols.map((field) => {
                                            const colDef = defaultEventColumns.find((c) => c.field === field);
                                            if (!colDef) return null;

                                            return (
                                                <TableCell
                                                    key={field}
                                                    align={colDef.align}
                                                    sortDirection={sortState.orderBy === field ? sortState.order : false}
                                                    sx={{ padding: '8px 16px' }}
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
                                    {sortedEvents.length > 0 ? (
                                        sortedEvents.map((event) => (
                                            <TableRow key={event.id} hover>
                                                {visibleCols.map((field) => (
                                                    <TableCell key={field} sx={{ padding: '8px 16px' }}>
                                                        {field === 'actions' && (
                                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                                <Tooltip title="Edit Event">
                                                                    <IconButton size="small" onClick={() => handleEditEvent(event.id)}>
                                                                        <EditIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Tooltip>
                                                                <Tooltip title="Delete Event">
                                                                    <IconButton size="small" onClick={() => handleDelete(event.id)}>
                                                                        <DeleteIcon fontSize="small" />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            </Box>
                                                        )}
                                                        {field === 'enabled' && (
                                                            <Switch
                                                                size="small"
                                                                checked={event.enabled}
                                                                onChange={(e) => handleEventToggle(event.id, e.target.checked)}
                                                                color="primary"
                                                            />
                                                        )}
                                                        {field === 'triggerLogic' && (
                                                            <Chip
                                                                label={event.triggerLogic}
                                                                size="small"
                                                                color={event.triggerLogic === 'ALL' ? 'secondary' : 'default'}
                                                            />
                                                        )}
                                                        {field === 'triggerCount' && (
                                                            <Typography variant="body2">
                                                                {event.triggers?.length || 0}
                                                            </Typography>
                                                        )}
                                                        {field === 'actionCount' && (
                                                            <Typography variant="body2">
                                                                {event.actions?.length || 0}
                                                            </Typography>
                                                        )}
                                                        {field === 'executionCount' && (
                                                            <Typography variant="body2">
                                                                {event.triggerCount || 0}
                                                            </Typography>
                                                        )}
                                                        {!['actions', 'enabled', 'triggerLogic', 'triggerCount', 'actionCount', 'executionCount'].includes(field) && (
                                                            <Typography variant="body2">
                                                                {event[field as keyof EventRuleData]?.toString() || '-'}
                                                            </Typography>
                                                        )}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={visibleCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                                <Typography color="textSecondary">
                                                    {searchTerm ? 'No events match your search' : 'No events found'}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        /* Tile Views (Standard/Mini) */
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: getGridColumns(),
                            gap: viewMode === 'mini' ? 1 : 2
                        }}>
                            {sortedEvents.length > 0 ? (
                                sortedEvents.map((event) => (
                                    <Card key={event.id} sx={{
                                        cursor: 'pointer',
                                        '&:hover': {
                                            boxShadow: theme.shadows[4]
                                        },
                                        minHeight: viewMode === 'mini' ? 120 : 200
                                    }}>
                                        <CardContent sx={{ p: viewMode === 'mini' ? 1 : 2 }}>
                                            <Box sx={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'flex-start',
                                                mb: 1
                                            }}>
                                                <Typography
                                                    variant={viewMode === 'mini' ? "caption" : "subtitle1"}
                                                    fontWeight="bold"
                                                    sx={{
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        flex: 1,
                                                        mr: 1
                                                    }}
                                                >
                                                    {event.name}
                                                </Typography>
                                                <Switch
                                                    size="small"
                                                    checked={event.enabled}
                                                    onChange={(
                                                        e) => {
                                                        e.stopPropagation();
                                                        handleEventToggle(event.id, e.target.checked);
                                                    }}
                                                    color="primary"
                                                />
                                            </Box>

                                            {viewMode === 'standard' && (
                                                <>
                                                    <Typography
                                                        variant="body2"
                                                        color="textSecondary"
                                                        sx={{ mb: 2 }}
                                                    >
                                                        {event.description}
                                                    </Typography>
                                                </>
                                            )}

                                            <Box sx={{
                                                display: 'flex',
                                                flexDirection: viewMode === 'mini' ? 'column' : 'row',
                                                gap: 0.5,
                                                mb: viewMode === 'mini' ? 1 : 2,
                                                flexWrap: 'wrap'
                                            }}>
                                                <Chip
                                                    label={event.triggerLogic}
                                                    size="small"
                                                    color={event.triggerLogic === 'ALL' ? 'secondary' : 'default'}
                                                />
                                                <Chip
                                                    label={`${event.triggers?.length || 0} triggers`}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                                <Chip
                                                    label={`${event.actions?.length || 0} actions`}
                                                    size="small"
                                                    variant="outlined"
                                                />
                                            </Box>

                                            {viewMode === 'standard' && event.lastTriggered && (
                                                <>
                                                    <Typography variant="caption" color="textSecondary">
                                                        Last Triggered: {new Date(event.lastTriggered).toLocaleString()}
                                                    </Typography>
                                                    <br />
                                                    <Typography variant="caption" color="textSecondary">
                                                        Executions: {event.triggerCount}
                                                    </Typography>
                                                </>
                                            )}

                                            <Box sx={{
                                                display: 'flex',
                                                justifyContent: 'flex-end',
                                                gap: 1,
                                                mt: 'auto'
                                            }}>
                                                <Tooltip title="Edit Event">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleEditEvent(event.id);
                                                        }}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete Event">
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDelete(event.id);
                                                        }}
                                                    >
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                ))
                            ) : (
                                <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                                    <Typography color="textSecondary">
                                        {searchTerm ? 'No events match your search' : 'No events found'}
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        onClick={handleAddEvent}
                                        startIcon={<AddIcon />}
                                        sx={{ mt: 2 }}
                                    >
                                        Add Your First Event
                                    </Button>
                                </Paper>
                            )}
                        </Box>
                    )}
                </Box>
            </AccordionDetails>
        </Accordion>
    );
};

export default EventEngineEventRules;