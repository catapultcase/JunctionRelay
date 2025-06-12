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

import React, { useState, useEffect, useMemo, useCallback, MouseEvent, memo } from "react";
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
    Tooltip,
    IconButton,
    Popover,
    List,
    ListItem,
    ListItemText,
    Checkbox,
} from "@mui/material";
import UpdateIcon from '@mui/icons-material/Update';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import {
    DeviceColumn,
    SortDirection,
    STORAGE_KEY_DEVICES_COLUMNS,
    STORAGE_KEY_DEVICES_SORT,
    defaultDeviceColumns,
    getHeartbeatStatusInfo,
    formatRelativeTime,
    getDeviceStatusInfo,
    getEnhancedConnModeDisplay
} from './Devices_Helpers';

// Memoized TableRow component for devices
const DeviceTableRow = memo(({
    device,
    visibleCols,
    allColumns,
    connectionStatuses,
    onDelete,
    onUpdate,
    navigate,
    updateStatuses,
    updatingDevices
}: {
    device: any,
    visibleCols: string[],
    allColumns: DeviceColumn[],
    connectionStatuses: Record<number, any>,
    onDelete: (e: React.MouseEvent, id: number) => void,
    onUpdate: (id: number, e: React.MouseEvent) => void,
    navigate: any,
    updateStatuses: Record<number, boolean>,
    updatingDevices: Set<number>
}) => {
    // Memoize cell rendering functions to prevent recreation on each render
    // FIXED: Added connectionStatuses to dependencies
    const getDeviceCell = useCallback((field: string) => {
        // First check if there's a custom renderer for this field
        const column = allColumns.find(col => col.field === field);
        if (column && column.renderCell) {
            return column.renderCell(device);
        }

        // Otherwise use the standard renderers
        switch (field) {
            case "name":
                return <Typography fontWeight="medium">{device.name}</Typography>;
            case "model":
                return device.deviceModel || "";
            case "ipAddress":
                return device.ipAddress || "";
            case "uniqueIdentifier":
                return device.uniqueIdentifier || "";
            case "status":
                const statusInfo = getDeviceStatusInfo(device.status);
                return (
                    <Chip
                        label={statusInfo.label}
                        color={statusInfo.color}
                        size="small"
                    />
                );
            case "connMode":
                const connectionStatus = connectionStatuses[device.id];
                const connModeDisplay = getEnhancedConnModeDisplay(device, connectionStatus);

                return (
                    <Chip
                        label={connModeDisplay.label}
                        color={connModeDisplay.color}
                        size="small"
                        sx={{
                            fontWeight: 'medium',
                            fontSize: '0.75rem',
                            height: 24
                        }}
                    />
                );
            case "firmware":
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {device.firmwareVersion}
                        {updateStatuses[device.id] === false && (
                            <Tooltip title="Firmware up to date">
                                <CheckCircleIcon fontSize="small" color="success" />
                            </Tooltip>
                        )}
                        {updateStatuses[device.id] === true && (
                            <Tooltip title="Firmware update available">
                                <WarningIcon fontSize="small" color="warning" />
                            </Tooltip>
                        )}
                    </Box>
                );
            case "custom":
                return device.hasCustomFirmware ? (
                    <Chip label="Yes" color="info" size="small" />
                ) : (
                    <Chip label="No" size="small" />
                );
            case "heartbeatStatus":
                const heartbeatInfo = getHeartbeatStatusInfo(
                    device, // Pass whole device object
                    device.heartbeatEnabled
                );

                // Add icon based on status
                let heartbeatIcon: React.ReactNode = undefined;
                if (heartbeatInfo.label === "Online") {
                    heartbeatIcon = <NetworkCheckIcon fontSize="small" />;
                } else if (heartbeatInfo.label === "Stale" || heartbeatInfo.label === "Unstable") {
                    heartbeatIcon = <WarningIcon fontSize="small" />;
                } else if (heartbeatInfo.label === "Testing") {
                    heartbeatIcon = <NetworkCheckIcon fontSize="small" />;
                } else if (heartbeatInfo.label === "Retesting") {
                    heartbeatIcon = <RefreshIcon fontSize="small" />;
                } else if (heartbeatInfo.label === "Failed" || heartbeatInfo.label === "Timeout" || heartbeatInfo.label === "Offline") {
                    heartbeatIcon = <SignalWifiOffIcon fontSize="small" />;
                }

                return heartbeatIcon ? (
                    <Chip
                        label={heartbeatInfo.label}
                        color={heartbeatInfo.color}
                        size="small"
                        icon={heartbeatIcon as React.ReactElement}
                        sx={{
                            fontWeight: 'medium',
                            fontSize: '0.75rem',
                            height: 24
                        }}
                    />
                ) : (
                    <Chip
                        label={heartbeatInfo.label}
                        color={heartbeatInfo.color}
                        size="small"
                        sx={{
                            fontWeight: 'medium',
                            fontSize: '0.75rem',
                            height: 24
                        }}
                    />
                );
            case "heartbeatProtocol":
                const protocol = device.heartbeatProtocol;
                const isEnabled = device.heartbeatEnabled !== false;

                if (!isEnabled) {
                    return (
                        <Chip
                            label="Disabled"
                            color="default"
                            size="small"
                            sx={{
                                fontWeight: 'medium',
                                fontSize: '0.75rem',
                                height: 24
                            }}
                        />
                    );
                }

                // If no protocol is set, show em dash
                if (!protocol) {
                    return "—";
                }

                // Color coding for different protocols
                let protocolColor: "default" | "primary" | "secondary" | "success" | "warning" | "info" | "error" = "default";
                switch (protocol.toUpperCase()) {
                    case 'HTTP':
                        protocolColor = "primary";
                        break;
                    case 'MQTT':
                        protocolColor = "success";
                        break;
                    case 'WEBSOCKET':
                        protocolColor = "info";
                        break;
                    case 'ICMP':
                        protocolColor = "warning";
                        break;
                    default:
                        protocolColor = "default";
                }

                return (
                    <Chip
                        label={protocol}
                        color={protocolColor}
                        size="small"
                        sx={{
                            fontWeight: 'medium',
                            fontSize: '0.75rem',
                            height: 24
                        }}
                    />
                );
            case "lastPinged":
                return (
                    <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                        {formatRelativeTime(device.lastPinged)}
                    </Typography>
                );
            case "pingLatency":
                return device.lastPingDurationMs ? `${device.lastPingDurationMs}ms` : "—";
            case "consecutiveFailures":
                const failures = device.consecutivePingFailures || 0;
                return failures > 0 ? (
                    <Chip
                        label={failures}
                        color={failures >= 3 ? "error" : "warning"}
                        size="small"
                        sx={{ fontSize: '0.75rem', height: 20 }}
                    />
                ) : "0";
            case "actions":
                return (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {updateStatuses[device.id] === true && (
                            <Tooltip title="Update Firmware">
                                <IconButton
                                    size="small"
                                    onClick={(e) => onUpdate(device.id, e)}
                                    disabled={updatingDevices.has(device.id)}
                                >
                                    {updatingDevices.has(device.id) ? (
                                        <CircularProgress size={16} />
                                    ) : (
                                        <UpdateIcon fontSize="small" />
                                    )}
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                onClick={(e) => onDelete(e, device.id)}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            default:
                return null;
        }
    }, [device, onDelete, onUpdate, updateStatuses, updatingDevices, allColumns, connectionStatuses]); // FIXED: Added connectionStatuses

    return (
        <TableRow
            hover
            onClick={() => navigate(`/configure-device/${device.id}`)}
            sx={{
                cursor: "pointer",
                '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.04)'
                }
            }}
        >
            {visibleCols.map((field) => {
                const colDef = allColumns.find((c) => c.field === field)!;
                return (
                    <TableCell
                        key={field}
                        align={colDef.align}
                    >
                        {getDeviceCell(field)}
                    </TableCell>
                );
            })}
        </TableRow>
    );
});

// DevicesTable component with column management
const DevicesTable: React.FC<{
    devices: any[];
    title: string;
    updateStatuses: Record<number, boolean>;
    updatingDevices: Set<number>;
    connectionStatuses: Record<number, any>;
    onDelete: (e: React.MouseEvent, id: number) => void;
    onUpdate: (id: number, e: React.MouseEvent) => void;
    navigate: any;
    storageKeySuffix?: string;
}> = ({
    devices,
    title,
    updateStatuses,
    updatingDevices,
    connectionStatuses,
    onDelete,
    onUpdate,
    navigate,
    storageKeySuffix = ""
}) => {
        const localStorageKey = `${STORAGE_KEY_DEVICES_COLUMNS}${storageKeySuffix}`;
        const sortStorageKey = `${STORAGE_KEY_DEVICES_SORT}${storageKeySuffix}`;

        // Column visibility state
        const [visibleDeviceCols, setVisibleDeviceCols] = useState<string[]>(() => {
            const stored = localStorage.getItem(localStorageKey);
            return stored ? JSON.parse(stored) : defaultDeviceColumns.map((c) => c.field);
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

        // Popover anchor
        const [anchorDeviceCols, setAnchorDeviceCols] = useState<HTMLElement | null>(null);

        // Sort the devices
        const sortedDevices = useMemo(() => {
            const { orderBy, order } = sortState;
            const comparator = (a: any, b: any) => {
                let valueA: any;
                let valueB: any;
                // Extract the values to compare based on orderBy
                switch (orderBy) {
                    case 'name':
                        valueA = a.name?.toLowerCase() || '';
                        valueB = b.name?.toLowerCase() || '';
                        break;
                    case 'model':
                        valueA = a.deviceModel?.toLowerCase() || '';
                        valueB = b.deviceModel?.toLowerCase() || '';
                        break;
                    case 'ipAddress':
                        valueA = a.ipAddress || '';
                        valueB = b.ipAddress || '';
                        break;
                    case 'uniqueIdentifier':
                        valueA = a.uniqueIdentifier?.toLowerCase() || '';
                        valueB = b.uniqueIdentifier?.toLowerCase() || '';
                        break;
                    case 'status':
                        valueA = a.status?.toLowerCase() || '';
                        valueB = b.status?.toLowerCase() || '';
                        break;
                    case 'connMode':
                        valueA = a.connMode?.toLowerCase() || '';
                        valueB = b.connMode?.toLowerCase() || '';
                        break;
                    case 'firmware':
                        valueA = a.firmwareVersion?.toLowerCase() || '';
                        valueB = b.firmwareVersion?.toLowerCase() || '';
                        break;
                    case 'custom':
                        valueA = a.hasCustomFirmware ? 1 : 0;
                        valueB = b.hasCustomFirmware ? 1 : 0;
                        break;
                    case 'heartbeatStatus':
                        // Use lastPingStatus if available, otherwise fall back to overall status
                        valueA = (a.lastPingStatus || a.status)?.toLowerCase() || '';
                        valueB = (b.lastPingStatus || b.status)?.toLowerCase() || '';
                        break;
                    case 'heartbeatProtocol':
                        valueA = a.heartbeatProtocol?.toLowerCase() || '';
                        valueB = b.heartbeatProtocol?.toLowerCase() || '';
                        break;
                    case 'lastPinged':
                        valueA = a.lastPinged ? new Date(a.lastPinged).getTime() : 0;
                        valueB = b.lastPinged ? new Date(b.lastPinged).getTime() : 0;
                        break;
                    case 'pingLatency':
                        valueA = a.lastPingDurationMs || 0;
                        valueB = b.lastPingDurationMs || 0;
                        break;
                    case 'consecutiveFailures':
                        valueA = a.consecutivePingFailures || 0;
                        valueB = b.consecutivePingFailures || 0;
                        break;
                    default:
                        valueA = a[orderBy] || '';
                        valueB = b[orderBy] || '';
                }
                // Compare the values
                if (valueA < valueB) {
                    return order === 'asc' ? -1 : 1;
                }
                if (valueA > valueB) {
                    return order === 'asc' ? 1 : -1;
                }
                return 0;
            };
            // Create a copy before sorting to avoid mutating props
            return [...devices].sort(comparator);
        }, [devices, sortState]);

        // Persist sort state when it changes
        useEffect(() => {
            localStorage.setItem(sortStorageKey, JSON.stringify(sortState));
        }, [sortState, sortStorageKey]);

        // Persist visible columns on change
        useEffect(() => {
            localStorage.setItem(localStorageKey, JSON.stringify(visibleDeviceCols));
        }, [visibleDeviceCols, localStorageKey]);

        // Memoize event handlers to prevent recreation on each render
        const openDevicePopover = useCallback((e: MouseEvent<HTMLElement>) => {
            e.stopPropagation(); // Prevent unwanted navigation
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

        return (
            <>
                {/* Table header with column selector */}
                <Box display="flex" alignItems="center" mb={1}>
                    <Typography variant="h6">{title}</Typography>

                    <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Button
                            onClick={openDevicePopover}
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
                    </Box>

                    {/* Columns Popover */}
                    <Popover
                        open={Boolean(anchorDeviceCols)}
                        anchorEl={anchorDeviceCols}
                        onClose={closeDevicePopover}
                    >
                        <List dense>
                            {/* visible columns first */}
                            {visibleDeviceCols.map((field) => (
                                <ListItem key={field}>
                                    <Checkbox
                                        checked
                                        onChange={(e) => {
                                            handleToggleColumn(field, e.target.checked);
                                        }}
                                    />
                                    <ListItemText primary={defaultDeviceColumns.find((c) => c.field === field)!.label} />
                                </ListItem>
                            ))}
                            {/* then hidden columns */}
                            {defaultDeviceColumns
                                .filter((c) => !visibleDeviceCols.includes(c.field))
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

                {/* Devices Table */}
                <TableContainer component={Paper} sx={{ mb: 4 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                {visibleDeviceCols.map((field) => {
                                    const colDef = defaultDeviceColumns.find((c) => c.field === field)!;
                                    return (
                                        <TableCell
                                            key={field}
                                            align={colDef.align}
                                            sortDirection={sortState.orderBy === field ? sortState.order : false}
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
                            {sortedDevices.length > 0 ? (
                                sortedDevices.map((device) => (
                                    <DeviceTableRow
                                        key={device.id}
                                        device={device}
                                        visibleCols={visibleDeviceCols}
                                        allColumns={defaultDeviceColumns}
                                        connectionStatuses={connectionStatuses}
                                        onDelete={onDelete}
                                        onUpdate={onUpdate}
                                        navigate={navigate}
                                        updateStatuses={updateStatuses}
                                        updatingDevices={updatingDevices}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={visibleDeviceCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">No {title.toLowerCase()} found</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </>
        );
    };

export default DevicesTable;