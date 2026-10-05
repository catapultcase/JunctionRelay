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

import React, { useState, useEffect, useMemo, useCallback, MouseEvent } from "react";
import {
    Button,
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
    IconButton,
    Popover,
    Checkbox,
    MenuItem,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    FormControlLabel,
    InputLabel,
    Select,
    Alert,
    ToggleButtonGroup,
    ToggleButton,
    Divider,
} from "@mui/material";
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import LinkIcon from '@mui/icons-material/Link';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import {
    SortDirection,
    STORAGE_KEY_DEVICES_COLUMNS,
    STORAGE_KEY_DEVICES_SORT,
    defaultDeviceColumns,
    defaultLocalDeviceColumns,
    defaultCloudDeviceColumns} from './Devices_Helpers';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useTheme, useMediaQuery } from "@mui/material";
import type { NavigateFunction } from 'react-router-dom';
import type { Device } from '../types/entities';
import { HierarchicalDevice, toViewMode, ViewMode } from '../types/devices';
import DeviceTableRow from './Devices_DeviceTableRow';
import DeviceCard from './Devices_DeviceCard';

// Storage key for view mode
const STORAGE_KEY_VIEW_MODE = "junctionrelay_devices_view_mode";



// DevicesTable component with column management, gateway nesting, view modes, and scan results support
/** A device's value for a sortable column. */
const sortKey = (device: Device, field: string): string | number => {
    const text = (value: string | null | undefined) => (value || '').toLowerCase();
    switch (field) {
        case 'name': return text(device.name);
        case 'type': return device.isGateway ? 0 : device.gatewayId ? 1 : device.type === "Cloud Device" ? 2 : 3;
        case 'model': return text(device.deviceModel);
        case 'ipAddress': return device.ipAddress || '';
        case 'COMPort': return device.comPort || '';
        case 'uniqueIdentifier': return text(device.uniqueIdentifier);
        case 'status': return text(device.status);
        case 'connMode': return text(device.connMode);
        case 'firmware': return text(device.firmwareVersion);
        case 'custom': return device.hasCustomFirmware ? 1 : 0;
        case 'heartbeatStatus': return text(device.lastPingStatus || device.status);
        case 'heartbeatProtocol': return text(device.heartbeatProtocol);
        case 'lastPinged': return device.lastPinged ? new Date(device.lastPinged).getTime() : 0;
        case 'pingLatency': return device.lastPingDurationMs || 0;
        case 'consecutiveFailures': return device.consecutivePingFailures || 0;
        case 'syncMode': return text(device.syncMode);
        default: return '';
    }
};

const DevicesTable: React.FC<{
    devices: Device[];
    title: string;
    updateStatuses: Record<number, boolean>;
    updatingDevices: Set<number>;
    onDelete: (e: React.MouseEvent, id: number) => void;
    onUpdate: (id: number, e: React.MouseEvent) => void;
    navigate: NavigateFunction;
    storageKeySuffix?: string;
    onDevicesChange?: () => void;
    refreshInterval?: number;
    onRefreshIntervalChange?: (interval: number) => void;
    refreshIntervalOptions?: Array<{ value: number; label: string }>;
    isCloudDevicesTable?: boolean;
    onSyncModeChange?: (deviceId: number, mode: string) => void;
}> = ({
    devices,
    title,
    updateStatuses,
    updatingDevices,
    onDelete,
    onUpdate,
    navigate,
    storageKeySuffix = "",
    onDevicesChange,
    refreshInterval,
    onRefreshIntervalChange,
    refreshIntervalOptions,
    isCloudDevicesTable = false,
    onSyncModeChange,
}) => {
        const localStorageKey = `${STORAGE_KEY_DEVICES_COLUMNS}${storageKeySuffix}`;
        const sortStorageKey = `${STORAGE_KEY_DEVICES_SORT}${storageKeySuffix}`;
        const viewModeStorageKey = `${STORAGE_KEY_VIEW_MODE}${storageKeySuffix}`;

        // Use feature flags hook
        const flags = useFeatureFlags();
        const theme = useTheme();
        const isMobile = useMediaQuery(theme.breakpoints.down('md'));

        // View mode state with proper isolation
        const [viewMode, setViewMode] = useState<ViewMode>(() => toViewMode(localStorage.getItem(viewModeStorageKey)));

        // Listen for view mode changes from bottom action bar (mobile only)
        useEffect(() => {
            const handleBottomActionViewModeChange = (e: CustomEvent) => {
                // Only respond to bottom action bar changes when in mobile mode
                if (isMobile && e.detail.mode) {
                    const newMode = toViewMode(e.detail.mode);
                    setViewMode(newMode);
                    localStorage.setItem(viewModeStorageKey, newMode);
                }
            };

            // Listen for localStorage changes from other tabs/windows
            // But only for this specific table's storage key
            const handleStorageChange = (e: StorageEvent) => {
                if (e.key === viewModeStorageKey && e.newValue) {
                    setViewMode(toViewMode(e.newValue));
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
        }, [viewModeStorageKey, isMobile]);

        // Handle view mode change from desktop toggle buttons
        const handleViewModeChange = useCallback((event: React.MouseEvent<HTMLElement>, newViewMode: ViewMode) => {
            if (newViewMode !== null) {
                setViewMode(newViewMode);
                localStorage.setItem(viewModeStorageKey, newViewMode);

                // Only dispatch event for bottom action bar sync on mobile
                // Desktop tables should be independent
                if (isMobile) {
                    window.dispatchEvent(new CustomEvent('bottom-action-view-mode-change', {
                        detail: { mode: newViewMode }
                    }));
                }
            }
        }, [viewModeStorageKey, isMobile]);

    // Create dynamic device columns based on feature flags
    const deviceColumns = useMemo(() => {
        const actionsAlignment = flags?.device_actions_alignment?.toLowerCase() === 'left' ? 'left' : 'right';

        return defaultDeviceColumns.map(col =>
            col.field === 'actions'
                ? { ...col, align: actionsAlignment as "left" | "right" | "center" | "inherit" | "justify" }
                : col
        );
    }, [flags?.device_actions_alignment]);

    // Column visibility state
    const [visibleDeviceCols, setVisibleDeviceCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(localStorageKey);

        // Use different defaults based on table type
        let defaultVisible: string[];
        if (isCloudDevicesTable) {
            defaultVisible = defaultCloudDeviceColumns;
        } else {
            defaultVisible = defaultLocalDeviceColumns;
        }

        return stored ? JSON.parse(stored) : defaultVisible;
    });

    // Sort state
    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(sortStorageKey);
            return stored ? JSON.parse(stored) : { orderBy: 'name', order: 'asc' };
        } catch (e) {
            return { orderBy: 'name', order: 'asc' };
        }
    });

    // Nesting dialog state
    const [nestingDialog, setNestingDialog] = useState<{
        open: boolean;
        deviceId: number | null;
        deviceName: string;
    }>({
        open: false,
        deviceId: null,
        deviceName: ''
    });

    // Available gateways state
    const [availableGateways, setAvailableGateways] = useState<Device[]>([]);
    const [selectedGatewayId, setSelectedGatewayId] = useState<number | null>(null);
    const [nestingLoading, setNestingLoading] = useState(false);
    const [nestingError, setNestingError] = useState<string | null>(null);

    // Notification management state
    const [notificationLoading] = useState<Set<number>>(new Set());
    const [notificationError, setNotificationError] = useState<string | null>(null);

    // Popover anchor
    const [anchorDeviceCols, setAnchorDeviceCols] = useState<HTMLElement | null>(null);

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

    // Build hierarchical structure: gateways with the devices nested under them
    const hierarchicalDevices = useMemo(() => {
        const gateways = devices.filter(d => d.isGateway);
        const children = devices.filter(d => d.gatewayId && !d.isGateway);
        const standalone = devices.filter(d => !d.isGateway && !d.gatewayId);

        const buildHierarchy = (device: Device, level: number = 0): HierarchicalDevice => {
            const deviceChildren = children.filter(c => c.gatewayId === device.id);

            return {
                device,
                children: deviceChildren.map(child => buildHierarchy(child, level + 1)),
                level
            };
        };

        const result: HierarchicalDevice[] = [];

        gateways.forEach(gateway => {
            result.push(buildHierarchy(gateway));
        });

        standalone.forEach(device => {
            result.push(buildHierarchy(device));
        });

        return result;
    }, [devices]);

    // Sort the hierarchical devices
    const sortedHierarchicalDevices = useMemo(() => {
        const { orderBy, order } = sortState;
        const comparator = (a: HierarchicalDevice, b: HierarchicalDevice) => {
            const valueA = sortKey(a.device, orderBy);
            const valueB = sortKey(b.device, orderBy);
            if (valueA < valueB) return order === 'asc' ? -1 : 1;
            if (valueA > valueB) return order === 'asc' ? 1 : -1;
            return 0;
        };

        return [...hierarchicalDevices].sort(comparator);
    }, [hierarchicalDevices, sortState]);

    // Add the new sync mode change handler
    const handleSyncModeChange = useCallback(async (deviceId: number, mode: string) => {
        try {
            const response = await fetch(`/api/localdevices/${deviceId}/sync-mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ syncMode: mode })
            });

            if (response.ok) {

                if (onDevicesChange) {
                    onDevicesChange();
                } else {
                    window.location.reload();
                }
            } else {
                const error = await response.json();
                console.error('Failed to update sync mode:', error.message);
            }
        } catch (error) {
            console.error('Error updating sync mode:', error);
        }
    }, [onDevicesChange]);

    // Handle nesting under gateway
    const handleNestUnderGateway = useCallback(async (deviceId: number) => {
        const device = devices.find(d => d.id === deviceId);
        if (!device) return;

        if (device.gatewayId) {
            try {
                setNestingLoading(true);
                const response = await fetch(`/api/devices/${deviceId}/nest-under-gateway`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gatewayId: null })
                });

                if (response.ok) {
                    if (onDevicesChange) {
                        onDevicesChange();
                    } else {
                        window.location.reload();
                    }
                } else {
                    const error = await response.json();
                    setNestingError(error.message || 'Failed to remove device from gateway');
                }
            } catch (error) {
                setNestingError('Error removing device from gateway');
                console.error('Error removing device from gateway:', error);
            } finally {
                setNestingLoading(false);
            }
            return;
        }

        try {
            const response = await fetch('/api/devices/gateways');
            if (response.ok) {
                const gateways = await response.json();
                setAvailableGateways(gateways);
                setNestingDialog({
                    open: true,
                    deviceId: deviceId,
                    deviceName: device.name
                });
                setSelectedGatewayId(null);
                setNestingError(null);
            } else {
                setNestingError('Failed to fetch available gateways');
            }
        } catch (error) {
            setNestingError('Error fetching available gateways');
            console.error('Error fetching gateways:', error);
        }
    }, [devices]);

    // Handle confirm nesting
    const handleConfirmNesting = useCallback(async () => {
        if (!nestingDialog.deviceId || !selectedGatewayId) return;

        try {
            setNestingLoading(true);
            setNestingError(null);

            const response = await fetch(`/api/devices/${nestingDialog.deviceId}/nest-under-gateway`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gatewayId: selectedGatewayId })
            });

            if (response.ok) {

                setNestingDialog({ open: false, deviceId: null, deviceName: '' });
                setSelectedGatewayId(null);

                if (onDevicesChange) {
                    onDevicesChange();
                } else {
                    window.location.reload();
                }
            } else {
                const error = await response.json();
                setNestingError(error.message || 'Failed to nest device under gateway');
            }
        } catch (error) {
            setNestingError('Error nesting device under gateway');
            console.error('Error nesting device:', error);
        } finally {
            setNestingLoading(false);
        }
    }, [nestingDialog.deviceId, selectedGatewayId]);

    // Handle close nesting dialog
    const handleCloseNestingDialog = useCallback(() => {
        setNestingDialog({ open: false, deviceId: null, deviceName: '' });
        setSelectedGatewayId(null);
        setNestingError(null);
    }, []);

    // Persist sort state when it changes
    useEffect(() => {
        localStorage.setItem(sortStorageKey, JSON.stringify(sortState));
    }, [sortState, sortStorageKey]);

    // Persist visible columns on change
    useEffect(() => {
        localStorage.setItem(localStorageKey, JSON.stringify(visibleDeviceCols));
    }, [visibleDeviceCols, localStorageKey]);

    // Memoize event handlers
    const openDevicePopover = useCallback((e: MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        setAnchorDeviceCols(e.currentTarget);
    }, []);

    const closeDevicePopover = useCallback(() =>
        setAnchorDeviceCols(null),
        []
    );

    // Handle sort request
    const handleRequestSort = useCallback((property: string) => {
        const isAsc = sortState.orderBy === property && sortState.order === 'asc';
        setSortState({
            orderBy: property,
            order: isAsc ? 'desc' : 'asc'
        });
    }, [sortState]);

    // Memoize column management handlers
    const handleToggleColumn = useCallback((field: string, checked: boolean) => {
        if (checked) {
            setVisibleDeviceCols(prev => [...prev, field]);
        } else {
            setVisibleDeviceCols(prev => prev.filter(f => f !== field));
        }
    }, []);

    // Utility to move an item up/down in the visible list
    const moveCol = useCallback((
        field: string,
        direction: "up" | "down"
    ) => {
        const list = visibleDeviceCols;
        const i = list.indexOf(field);
        if (i < 0) return;
        const j = direction === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        const copy = [...list];
        copy.splice(i, 1);
        copy.splice(j, 0, field);
        setVisibleDeviceCols(copy);
    }, [visibleDeviceCols]);

    // Memoize column rearrangement handler
    const handleMoveColumn = useCallback((field: string, direction: "up" | "down") => {
        moveCol(field, direction);
    }, [moveCol]);

    // Use passed handlers or default to internal ones
    const finalSyncModeChange = onSyncModeChange || handleSyncModeChange;


    return (
    <>
            {/* Table header with view mode toggle, auto-refresh and column selector */}
            <Box display="flex" alignItems="center" mb={1} flexWrap="wrap" gap={2}>
                <Typography variant="h6">{title}</Typography>

                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                    {/* Column settings cog - Only show in table view and not for scan results */}
                    {viewMode === 'table' && (
                        <IconButton
                            size="small"
                            onClick={openDevicePopover}
                        >
                            <SettingsIcon fontSize="small" />
                        </IconButton>
                    )}

                    {/* View Mode Toggle - ONLY show on desktop (hidden on mobile since it's in bottom bar) and not for scan results */}
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

                    {/* Auto-Refresh Control */}
                    {refreshInterval !== undefined && onRefreshIntervalChange && refreshIntervalOptions && (
                        <FormControl size="small" sx={{ minWidth: 140 }}>
                            <InputLabel>Auto-Refresh</InputLabel>
                            <Select
                                value={refreshInterval}
                                label="Auto-Refresh"
                                onChange={(e) => onRefreshIntervalChange(Number(e.target.value))}
                            >
                                {refreshIntervalOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                </Box>

                {/* Columns Popover */}
                <Popover
                    open={Boolean(anchorDeviceCols)}
                    anchorEl={anchorDeviceCols}
                    onClose={closeDevicePopover}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                >
                    <Box sx={{ p: 2, minWidth: 200 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>Columns</Typography>
                        <Divider sx={{ mb: 1 }} />
                        {visibleDeviceCols.map((field, idx) => (
                            <Box key={field} sx={{ display: 'flex', alignItems: 'center' }}>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked
                                            onChange={(e) => handleToggleColumn(field, e.target.checked)}
                                            size="small"
                                        />
                                    }
                                    label={<Typography variant="body2">{defaultDeviceColumns.find((c) => c.field === field)!.label}</Typography>}
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
                                    disabled={idx === visibleDeviceCols.length - 1}
                                >
                                    <ArrowDownwardIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        ))}
                        {defaultDeviceColumns
                            .filter((c) => !visibleDeviceCols.includes(c.field))
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
            </Box>

            {/* Error Display */}
            {notificationError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setNotificationError(null)}>
                    {notificationError}
                </Alert>
            )}

                {/* Render based on view mode */}
                {viewMode === 'table' ? (
                    /* Table View */
                    <TableContainer component={Paper} sx={{ mb: 4 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                    {visibleDeviceCols.map((field) => {
                                        const colDef = deviceColumns.find((c) => c.field === field)!;

                                        const getColumnWidth = (field: string) => {
                                            switch (field) {
                                                case "name":
                                                    return { minWidth: 200, width: 'auto' };
                                                case "type":
                                                    return { minWidth: 120, width: 120 };
                                                case "model":
                                                    return { minWidth: 150, width: 'auto' };
                                                case "ipAddress":
                                                    return { minWidth: 140, width: 140 };
                                                case "COMPort":
                                                    return { minWidth: 140, width: 140 };
                                                case "uniqueIdentifier":
                                                    return { minWidth: 160, width: 'auto' };
                                                case "status":
                                                    return { minWidth: 100, width: 100 };
                                                case "connMode":
                                                    return { minWidth: 180, width: 'auto' };
                                                case "firmware":
                                                    return { minWidth: 120, width: 'auto' };
                                                case "custom":
                                                    return { minWidth: 80, width: 80 };
                                                case "heartbeatStatus":
                                                    return { minWidth: 100, width: 100 };
                                                case "heartbeatProtocol":
                                                    return { minWidth: 100, width: 100 };
                                                case "lastPinged":
                                                    return { minWidth: 120, width: 'auto' };
                                                case "pingLatency":
                                                    return { minWidth: 80, width: 80 };
                                                case "consecutiveFailures":
                                                    return { minWidth: 80, width: 80 };
                                                case "syncMode":
                                                    return { minWidth: 100, width: 100 };
                                                case "actions":
                                                    return { minWidth: 140, width: 140 };
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
                                {sortedHierarchicalDevices.length > 0 ? (
                                    sortedHierarchicalDevices.map((hierarchicalDevice) => (
                                        <DeviceTableRow
                                            key={hierarchicalDevice.device.id}
                                            hierarchicalDevice={hierarchicalDevice}
                                            visibleCols={visibleDeviceCols}
                                            allColumns={deviceColumns}
                                            onDelete={onDelete}
                                            onUpdate={onUpdate}
                                            navigate={navigate}
                                            updateStatuses={updateStatuses}
                                            updatingDevices={updatingDevices}
                                            onNestUnderGateway={handleNestUnderGateway}
                                            onSyncModeChange={finalSyncModeChange}
                                            notificationLoading={notificationLoading}
                                        />
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={visibleDeviceCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                            <Typography color="textSecondary">
                                                {`No ${title.toLowerCase()} found`}
                                            </Typography>
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
                        {sortedHierarchicalDevices.length > 0 ? (
                            sortedHierarchicalDevices.map((hierarchicalDevice) => (
                                <DeviceCard
                                    key={hierarchicalDevice.device.id}
                                    hierarchicalDevice={hierarchicalDevice}
                                    viewMode={viewMode as 'standard' | 'mini'}
                                    onDelete={onDelete}
                                    onUpdate={onUpdate}
                                    navigate={navigate}
                                    updateStatuses={updateStatuses}
                                    updatingDevices={updatingDevices}
                                    onNestUnderGateway={handleNestUnderGateway}
                                    onSyncModeChange={finalSyncModeChange}
                                    notificationLoading={notificationLoading}
                                />
                            ))
                        ) : (
                            <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                                <Typography color="textSecondary">
                                    {`No ${title.toLowerCase()} found`}
                                </Typography>
                            </Paper>
                        )}
                    </Box>
                )}

                {/* Nesting Dialog */}
                <Dialog
                    open={nestingDialog.open}
                    onClose={handleCloseNestingDialog}
                    maxWidth="sm"
                    fullWidth
                >
                    <DialogTitle>
                        Nest Device Under Gateway
                    </DialogTitle>
                    <DialogContent>
                        {nestingError && (
                            <Alert severity="error" sx={{ mb: 2 }}>
                                {nestingError}
                            </Alert>
                        )}

                        <Typography variant="body1" sx={{ mb: 2 }}>
                            Select a gateway to nest "{nestingDialog.deviceName}" under:
                        </Typography>

                        <FormControl fullWidth>
                            <InputLabel>Gateway Device</InputLabel>
                            <Select
                                value={selectedGatewayId || ''}
                                label="Gateway Device"
                                onChange={(e) => setSelectedGatewayId(Number(e.target.value) || null)}
                                disabled={nestingLoading}
                            >
                                {availableGateways.map((gateway) => (
                                    <MenuItem key={gateway.id} value={gateway.id}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <DeviceHubIcon fontSize="small" color="primary" />
                                            <Typography>{gateway.name}</Typography>
                                            {gateway.ipAddress && (
                                                <Typography variant="body2" color="text.secondary">
                                                    ({gateway.ipAddress})
                                                </Typography>
                                            )}
                                        </Box>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </DialogContent>
                    <DialogActions>
                        <Button
                            onClick={handleCloseNestingDialog}
                            disabled={nestingLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleConfirmNesting}
                            variant="contained"
                            disabled={!selectedGatewayId || nestingLoading}
                            startIcon={nestingLoading ? <CircularProgress size={16} /> : <LinkIcon />}
                        >
                            {nestingLoading ? 'Nesting...' : 'Nest Device'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </>
        );
    };

export default DevicesTable;