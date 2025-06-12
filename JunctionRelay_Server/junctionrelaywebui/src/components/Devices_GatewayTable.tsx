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
    HierarchicalDevice,
    STORAGE_KEY_DEVICES_COLUMNS,
    STORAGE_KEY_DEVICES_SORT,
    gatewayDeviceColumns,
    getHeartbeatStatusInfo,
    formatRelativeTime,
    getDeviceStatusInfo,
    getEnhancedConnModeDisplay
} from './Devices_Helpers';

// Memoized Gateway TableRow component
const GatewayDeviceTableRow = memo(({
    hierarchicalDevice,
    visibleCols,
    allColumns,
    connectionStatuses,
    onDelete,
    onUpdate,
    navigate,
    updateStatuses,
    updatingDevices
}: {
    hierarchicalDevice: HierarchicalDevice,
    visibleCols: string[],
    allColumns: DeviceColumn[],
    connectionStatuses: Record<number, any>,
    onDelete: (e: React.MouseEvent, id: number) => void,
    onUpdate: (id: number, e: React.MouseEvent) => void,
    navigate: any,
    updateStatuses: Record<number, boolean>,
    updatingDevices: Set<number>
}) => {
    const { device, isChild, level } = hierarchicalDevice;

    // Memoize cell rendering functions - FIXED: Added connectionStatuses to dependencies
    const getDeviceCell = useCallback((field: string) => {
        // First check if there's a custom renderer for this field
        const column = allColumns.find(col => col.field === field);
        if (column && column.renderCell) {
            return column.renderCell(device);
        }

        // Handle indentation for device name in hierarchical view
        if (field === "name") {
            return (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {isChild && (
                        <Box sx={{
                            width: level * 20,
                            display: 'flex',
                            alignItems: 'center',
                            mr: 1
                        }}>
                            <Box sx={{
                                width: 16,
                                height: 1,
                                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                mr: 1
                            }} />
                            <Box sx={{
                                width: 0,
                                height: 0,
                                borderLeft: '4px solid rgba(0, 0, 0, 0.2)',
                                borderTop: '4px solid transparent',
                                borderBottom: '4px solid transparent'
                            }} />
                        </Box>
                    )}
                    <Typography
                        fontWeight={isChild ? "normal" : "medium"}
                        color={isChild ? "textSecondary" : "textPrimary"}
                    >
                        {device.name}
                    </Typography>
                    {device.isGateway && (
                        <Chip
                            label="Gateway"
                            color="primary"
                            size="small"
                            sx={{ ml: 1, fontSize: '0.7rem', height: 20 }}
                        />
                    )}
                </Box>
            );
        }

        // Otherwise use the standard renderers
        switch (field) {
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
                    device,
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

                if (!protocol) {
                    return "—";
                }

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
    }, [device, onDelete, onUpdate, updateStatuses, updatingDevices, allColumns, isChild, level, connectionStatuses]); // FIXED: Added connectionStatuses

    return (
        <TableRow
            hover
            onClick={() => navigate(`/configure-device/${device.id}`)}
            sx={{
                cursor: "pointer",
                backgroundColor: isChild ? 'rgba(0, 0, 0, 0.02)' : 'inherit',
                '&:hover': {
                    backgroundColor: isChild ? 'rgba(0, 0, 0, 0.06)' : 'rgba(0, 0, 0, 0.04)'
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

// Gateway Devices Table Component
const GatewayDevicesTable: React.FC<{
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
            return stored ? JSON.parse(stored) : gatewayDeviceColumns.map((c) => c.field);
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

        // Create hierarchical structure
        const hierarchicalDevices = useMemo(() => {
            const result: HierarchicalDevice[] = [];

            // First, identify gateway devices
            const gateways = devices.filter(d => d.isGateway);

            // Create a map of gateway ID to child devices
            const childrenMap = new Map<number, any[]>();
            devices.forEach(device => {
                if (device.gatewayId && !device.isGateway) {
                    if (!childrenMap.has(device.gatewayId)) {
                        childrenMap.set(device.gatewayId, []);
                    }
                    childrenMap.get(device.gatewayId)!.push(device);
                }
            });

            // Add gateways and their children to the result
            gateways.forEach(gateway => {
                result.push({
                    device: gateway,
                    children: childrenMap.get(gateway.id) || [],
                    isChild: false,
                    level: 0
                });

                // Add children
                const children = childrenMap.get(gateway.id) || [];
                children.forEach(child => {
                    result.push({
                        device: child,
                        children: [],
                        isChild: true,
                        level: 1
                    });
                });
            });

            return result;
        }, [devices]);

        // Sort the hierarchical devices (only sort gateways, children stay with their parents)
        const sortedHierarchicalDevices = useMemo(() => {
            const { orderBy, order } = sortState;

            // Separate gateways and children
            const gateways = hierarchicalDevices.filter(hd => !hd.isChild);
            const childrenMap = new Map<number, HierarchicalDevice[]>();

            hierarchicalDevices.filter(hd => hd.isChild).forEach(child => {
                const gatewayId = child.device.gatewayId;
                if (!childrenMap.has(gatewayId)) {
                    childrenMap.set(gatewayId, []);
                }
                childrenMap.get(gatewayId)!.push(child);
            });

            const comparator = (a: HierarchicalDevice, b: HierarchicalDevice) => {
                let valueA: any;
                let valueB: any;

                switch (orderBy) {
                    case 'name':
                        valueA = a.device.name?.toLowerCase() || '';
                        valueB = b.device.name?.toLowerCase() || '';
                        break;
                    case 'model':
                        valueA = a.device.deviceModel?.toLowerCase() || '';
                        valueB = b.device.deviceModel?.toLowerCase() || '';
                        break;
                    case 'ipAddress':
                        valueA = a.device.ipAddress || '';
                        valueB = b.device.ipAddress || '';
                        break;
                    case 'status':
                        valueA = a.device.status?.toLowerCase() || '';
                        valueB = b.device.status?.toLowerCase() || '';
                        break;
                    case 'connMode':
                        valueA = a.device.connMode?.toLowerCase() || '';
                        valueB = b.device.connMode?.toLowerCase() || '';
                        break;
                    default:
                        valueA = a.device[orderBy] || '';
                        valueB = b.device[orderBy] || '';
                }

                if (valueA < valueB) {
                    return order === 'asc' ? -1 : 1;
                }
                if (valueA > valueB) {
                    return order === 'asc' ? 1 : -1;
                }
                return 0;
            };

            // Sort gateways
            const sortedGateways = [...gateways].sort(comparator);

            // Rebuild the list with sorted gateways and their children
            const result: HierarchicalDevice[] = [];
            sortedGateways.forEach(gateway => {
                result.push(gateway);
                const children = childrenMap.get(gateway.device.id) || [];
                // Sort children too
                const sortedChildren = [...children].sort(comparator);
                result.push(...sortedChildren);
            });

            return result;
        }, [hierarchicalDevices, sortState]);

        // Persist sort state when it changes
        useEffect(() => {
            localStorage.setItem(sortStorageKey, JSON.stringify(sortState));
        }, [sortState, sortStorageKey]);

        // Persist visible columns on change
        useEffect(() => {
            localStorage.setItem(localStorageKey, JSON.stringify(visibleDeviceCols));
        }, [visibleDeviceCols, localStorageKey]);

        // Event handlers
        const openDevicePopover = useCallback((e: MouseEvent<HTMLElement>) => {
            e.stopPropagation();
            setAnchorDeviceCols(e.currentTarget);
        }, []);

        const closeDevicePopover = useCallback(() =>
            setAnchorDeviceCols(null),
            []
        );

        const handleRequestSort = useCallback((property: string) => {
            const isAsc = sortState.orderBy === property && sortState.order === 'asc';
            setSortState({
                orderBy: property,
                order: isAsc ? 'desc' : 'asc'
            });
        }, [sortState]);

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
                                    <ListItemText primary={gatewayDeviceColumns.find((c) => c.field === field)!.label} />
                                </ListItem>
                            ))}
                            {/* then hidden columns */}
                            {gatewayDeviceColumns
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

                {/* Gateway Devices Table */}
                <TableContainer component={Paper} sx={{ mb: 4 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                {visibleDeviceCols.map((field) => {
                                    const colDef = gatewayDeviceColumns.find((c) => c.field === field)!;
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
                            {sortedHierarchicalDevices.length > 0 ? (
                                sortedHierarchicalDevices.map((hierarchicalDevice, index) => (
                                    <GatewayDeviceTableRow
                                        key={`${hierarchicalDevice.device.id}-${hierarchicalDevice.isChild}`}
                                        hierarchicalDevice={hierarchicalDevice}
                                        visibleCols={visibleDeviceCols}
                                        allColumns={gatewayDeviceColumns}
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
                                        <Typography color="textSecondary">No gateway devices found</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </>
        );
    };

export default GatewayDevicesTable;