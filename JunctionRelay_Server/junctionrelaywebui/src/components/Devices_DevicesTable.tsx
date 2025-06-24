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
    Menu,
    MenuItem,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    Alert,
} from "@mui/material";
import UpdateIcon from '@mui/icons-material/Update';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import MemoryIcon from '@mui/icons-material/Memory';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import CloudIcon from '@mui/icons-material/Cloud';
import {
    DeviceColumn,
    SortDirection,
    STORAGE_KEY_DEVICES_COLUMNS,
    STORAGE_KEY_DEVICES_SORT,
    defaultDeviceColumns,
    getHeartbeatStatusInfo,
    formatRelativeTime,
    getDeviceStatusInfo,
    getEnhancedConnModeDisplay,
    getDeviceTypeInfo
} from './Devices_Helpers';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

// Interface for hierarchical device structure
interface HierarchicalDevice {
    device: any;
    children: HierarchicalDevice[];
    level: number;
}

// Memoized TableRow component for devices with nesting support
const DeviceTableRow = memo(({
    hierarchicalDevice,
    visibleCols,
    allColumns,
    connectionStatuses,
    onDelete,
    onUpdate,
    navigate,
    updateStatuses,
    updatingDevices,
    onNestUnderGateway
}: {
    hierarchicalDevice: HierarchicalDevice,
    visibleCols: string[],
    allColumns: DeviceColumn[],
    connectionStatuses: Record<number, any>,
    onDelete: (e: React.MouseEvent, id: number) => void,
    onUpdate: (id: number, e: React.MouseEvent) => void,
    navigate: any,
    updateStatuses: Record<number, boolean>,
    updatingDevices: Set<number>,
    onNestUnderGateway: (deviceId: number) => void
}) => {
    const { device, children, level } = hierarchicalDevice;
    const hasChildren = children.length > 0;
    const isGateway = device.isGateway;
    const isChild = level > 0;
    const isCloudDevice = device.type === "Cloud Device";

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{
        mouseX: number;
        mouseY: number;
    } | null>(null);

    // Handle right-click context menu
    const handleContextMenu = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setContextMenu(
            contextMenu === null
                ? {
                    mouseX: event.clientX + 2,
                    mouseY: event.clientY - 6,
                }
                : null
        );
    }, [contextMenu]);

    const handleCloseContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleNestUnderGateway = useCallback(() => {
        onNestUnderGateway(device.id);
        handleCloseContextMenu();
    }, [device.id, onNestUnderGateway, handleCloseContextMenu]);

    // Memoize cell rendering functions to prevent recreation on each render
    const getDeviceCell = useCallback((field: string) => {
        // First check if there's a custom renderer for this field
        const column = allColumns.find(col => col.field === field);
        if (column && column.renderCell) {
            return column.renderCell(device);
        }

        // Handle name field with hierarchy indicators
        if (field === "name") {
            return (
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: isChild ? 1.5 : 0, // Reduced indent for child devices
                    gap: 1
                }}>
                    {/* Visual hierarchy indicator for child devices */}
                    {isChild && (
                        <SubdirectoryArrowRightIcon
                            fontSize="small"
                            color="disabled"
                            sx={{ mr: 0.5 }}
                        />
                    )}

                    {/* Device type icons - consistent for all devices */}
                    {isGateway ? (
                        <DeviceHubIcon fontSize="small" color="primary" />
                    ) : isChild ? (
                        <AccountTreeIcon fontSize="small" color="secondary" />
                    ) : isCloudDevice ? (
                        <CloudIcon fontSize="small" color="info" />
                    ) : (
                        <MemoryIcon fontSize="small" color="action" />
                    )}

                    <Typography
                        fontWeight="medium"
                        color="text.primary"
                    >
                        {device.name}
                    </Typography>
                </Box>
            );
        }

        // Handle type field
        if (field === "type") {
            const typeInfo = getDeviceTypeInfo(device);
            return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {isGateway ? (
                        <DeviceHubIcon fontSize="small" color="primary" />
                    ) : isChild ? (
                        <AccountTreeIcon fontSize="small" color="secondary" />
                    ) : (
                        <MemoryIcon fontSize="small" color="action" />
                    )}
                    <Chip
                        label={typeInfo.label}
                        color={typeInfo.color}
                        size="small"
                        sx={{ fontSize: '0.75rem', height: 22 }}
                    />
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
                // Get the alignment from the column definition (which uses the feature flag)
                const column = allColumns.find(col => col.field === field);
                const alignment = column?.align || 'right';

                // Convert alignment to flexbox justify-content value
                const justifyContent = alignment === 'left' ? 'flex-start' :
                    alignment === 'center' ? 'center' : 'flex-end';

                return (
                    <Box sx={{ display: 'flex', justifyContent }}>
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
    }, [device, onDelete, onUpdate, updateStatuses, updatingDevices, allColumns, connectionStatuses, level, isGateway, hasChildren, isChild]);

    const renderRows = () => {
        const rows = [];

        // Main device row
        rows.push(
            <TableRow
                key={device.id}
                hover
                onClick={() => navigate(`/configure-device/${device.id}`)}
                onContextMenu={handleContextMenu}
                sx={{
                    cursor: "pointer",
                    backgroundColor: isGateway ? 'rgba(25, 118, 210, 0.04)' :
                        isChild ? 'rgba(0, 0, 0, 0.02)' : 'inherit',
                    '&:hover': {
                        backgroundColor: isGateway ? 'rgba(25, 118, 210, 0.08)' :
                            isChild ? 'rgba(0, 0, 0, 0.06)' : 'rgba(0, 0, 0, 0.04)'
                    }
                }}
            >
                {visibleCols.map((field) => {
                    const colDef = allColumns.find((c) => c.field === field)!;

                    // Define column widths - consistent with header
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
                            case "uniqueIdentifier":
                                return { minWidth: 160, width: 'auto' };
                            case "status":
                                return { minWidth: 100, width: 100 };
                            case "connMode":
                                return { minWidth: 140, width: 'auto' };
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
                            sx={{
                                ...columnWidth,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                padding: '8px 16px'
                            }}
                        >
                            {getDeviceCell(field)}
                        </TableCell>
                    );
                })}
            </TableRow>
        );

        // Child rows (always visible now)
        if (hasChildren) {
            children.forEach(childHierarchy => {
                rows.push(...renderChildRows(childHierarchy));
            });
        }

        return rows;
    };

    const renderChildRows = (childHierarchy: HierarchicalDevice): React.ReactNode[] => {
        const childComponent = (
            <DeviceTableRow
                key={childHierarchy.device.id}
                hierarchicalDevice={childHierarchy}
                visibleCols={visibleCols}
                allColumns={allColumns}
                connectionStatuses={connectionStatuses}
                onDelete={onDelete}
                onUpdate={onUpdate}
                navigate={navigate}
                updateStatuses={updateStatuses}
                updatingDevices={updatingDevices}
                onNestUnderGateway={onNestUnderGateway}
            />
        );
        return [childComponent];
    };

    return <>
        {renderRows()}

        {/* Context Menu */}
        <Menu
            open={contextMenu !== null}
            onClose={handleCloseContextMenu}
            anchorReference="anchorPosition"
            anchorPosition={
                contextMenu !== null
                    ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                    : undefined
            }
        >
            {!isGateway && !isCloudDevice && (
                <MenuItem onClick={handleNestUnderGateway}>
                    <LinkIcon sx={{ mr: 1 }} />
                    Nest under Gateway
                </MenuItem>
            )}
            {isChild && (
                <MenuItem onClick={() => {
                    onNestUnderGateway(device.id); // This will handle removing from gateway
                    handleCloseContextMenu();
                }}>
                    <LinkOffIcon sx={{ mr: 1 }} />
                    Remove from Gateway
                </MenuItem>
            )}
            {(!isGateway && !isChild && !isCloudDevice) && (
                <MenuItem disabled>
                    <Typography variant="body2" color="text.secondary">
                        No nesting options available
                    </Typography>
                </MenuItem>
            )}
        </Menu>
    </>;
});

// DevicesTable component with column management and gateway nesting
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
    onDevicesChange?: () => void;
    refreshInterval?: number;
    onRefreshIntervalChange?: (interval: number) => void;
    refreshIntervalOptions?: Array<{ value: number; label: string }>;
}> = ({
    devices,
    title,
    updateStatuses,
    updatingDevices,
    connectionStatuses,
    onDelete,
    onUpdate,
    navigate,
    storageKeySuffix = "",
    onDevicesChange,
    refreshInterval,
    onRefreshIntervalChange,
    refreshIntervalOptions
}) => {
        const localStorageKey = `${STORAGE_KEY_DEVICES_COLUMNS}${storageKeySuffix}`;
        const sortStorageKey = `${STORAGE_KEY_DEVICES_SORT}${storageKeySuffix}`;

        // Use feature flags hook
        const flags = useFeatureFlags();

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
            // Default visible columns with 'actions' as the first column
            const defaultVisible = ["actions", "name", "type", "model", "ipAddress", "uniqueIdentifier", "status", "connMode", "firmware", "custom", "heartbeatStatus", "heartbeatProtocol", "lastPinged", "pingLatency", "consecutiveFailures"];
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
        const [availableGateways, setAvailableGateways] = useState<any[]>([]);
        const [selectedGatewayId, setSelectedGatewayId] = useState<number | null>(null);
        const [nestingLoading, setNestingLoading] = useState(false);
        const [nestingError, setNestingError] = useState<string | null>(null);

        // Popover anchor
        const [anchorDeviceCols, setAnchorDeviceCols] = useState<HTMLElement | null>(null);

        // Build hierarchical structure
        const hierarchicalDevices = useMemo(() => {
            // Separate gateways, their children, and standalone devices
            const gateways = devices.filter(d => d.isGateway);
            const children = devices.filter(d => d.gatewayId && !d.isGateway);
            const standalone = devices.filter(d => !d.isGateway && !d.gatewayId);

            // Build hierarchy
            const buildHierarchy = (device: any, level: number = 0): HierarchicalDevice => {
                const deviceChildren = children.filter(c => c.gatewayId === device.id);

                return {
                    device,
                    children: deviceChildren.map(child => buildHierarchy(child, level + 1)),
                    level
                };
            };

            // Create hierarchical structure
            const result: HierarchicalDevice[] = [];

            // Add gateways with their children
            gateways.forEach(gateway => {
                result.push(buildHierarchy(gateway));
            });

            // Add standalone devices
            standalone.forEach(device => {
                result.push(buildHierarchy(device));
            });

            return result;
        }, [devices]);

        // Sort the hierarchical devices (only top-level sorting)
        const sortedHierarchicalDevices = useMemo(() => {
            const { orderBy, order } = sortState;
            const comparator = (a: HierarchicalDevice, b: HierarchicalDevice) => {
                let valueA: any;
                let valueB: any;

                // Extract the values to compare based on orderBy
                switch (orderBy) {
                    case 'name':
                        valueA = a.device.name?.toLowerCase() || '';
                        valueB = b.device.name?.toLowerCase() || '';
                        break;
                    case 'type':
                        // Sort by type: Gateway > Child > Cloud Device > Standalone
                        const getTypePriority = (device: any) => {
                            if (device.isGateway) return 0;
                            if (device.gatewayId && !device.isGateway) return 1;
                            if (device.type === "Cloud Device") return 2;
                            return 3;
                        };
                        valueA = getTypePriority(a.device);
                        valueB = getTypePriority(b.device);
                        break;
                    case 'model':
                        valueA = a.device.deviceModel?.toLowerCase() || '';
                        valueB = b.device.deviceModel?.toLowerCase() || '';
                        break;
                    case 'ipAddress':
                        valueA = a.device.ipAddress || '';
                        valueB = b.device.ipAddress || '';
                        break;
                    case 'uniqueIdentifier':
                        valueA = a.device.uniqueIdentifier?.toLowerCase() || '';
                        valueB = b.device.uniqueIdentifier?.toLowerCase() || '';
                        break;
                    case 'status':
                        valueA = a.device.status?.toLowerCase() || '';
                        valueB = b.device.status?.toLowerCase() || '';
                        break;
                    case 'connMode':
                        valueA = a.device.connMode?.toLowerCase() || '';
                        valueB = b.device.connMode?.toLowerCase() || '';
                        break;
                    case 'firmware':
                        valueA = a.device.firmwareVersion?.toLowerCase() || '';
                        valueB = b.device.firmwareVersion?.toLowerCase() || '';
                        break;
                    case 'custom':
                        valueA = a.device.hasCustomFirmware ? 1 : 0;
                        valueB = b.device.hasCustomFirmware ? 1 : 0;
                        break;
                    case 'heartbeatStatus':
                        valueA = (a.device.lastPingStatus || a.device.status)?.toLowerCase() || '';
                        valueB = (b.device.lastPingStatus || b.device.status)?.toLowerCase() || '';
                        break;
                    case 'heartbeatProtocol':
                        valueA = a.device.heartbeatProtocol?.toLowerCase() || '';
                        valueB = b.device.heartbeatProtocol?.toLowerCase() || '';
                        break;
                    case 'lastPinged':
                        valueA = a.device.lastPinged ? new Date(a.device.lastPinged).getTime() : 0;
                        valueB = b.device.lastPinged ? new Date(b.device.lastPinged).getTime() : 0;
                        break;
                    case 'pingLatency':
                        valueA = a.device.lastPingDurationMs || 0;
                        valueB = b.device.lastPingDurationMs || 0;
                        break;
                    case 'consecutiveFailures':
                        valueA = a.device.consecutivePingFailures || 0;
                        valueB = b.device.consecutivePingFailures || 0;
                        break;
                    default:
                        valueA = a.device[orderBy] || '';
                        valueB = b.device[orderBy] || '';
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

            return [...hierarchicalDevices].sort(comparator);
        }, [hierarchicalDevices, sortState]);

        // Handle nesting under gateway
        const handleNestUnderGateway = useCallback(async (deviceId: number) => {
            const device = devices.find(d => d.id === deviceId);
            if (!device) return;

            // If device is already nested, we're removing it from gateway
            if (device.gatewayId) {
                try {
                    setNestingLoading(true);
                    const response = await fetch(`/api/devices/${deviceId}/nest-under-gateway`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ gatewayId: null })
                    });

                    if (response.ok) {
                        const result = await response.json();
                        // Show success message (you might want to add a snackbar here)
                        console.log(result.message);
                        // Refresh devices to reflect changes
                        if (onDevicesChange) {
                            onDevicesChange();
                        } else {
                            window.location.reload(); // Fallback
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

            // Otherwise, open dialog to select gateway
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
                    const result = await response.json();
                    // Show success message
                    console.log(result.message);

                    // Close dialog
                    setNestingDialog({ open: false, deviceId: null, deviceName: '' });
                    setSelectedGatewayId(null);

                    // Refresh devices to reflect changes
                    if (onDevicesChange) {
                        onDevicesChange();
                    } else {
                        window.location.reload(); // Fallback
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

        return (
            <>
                {/* Table header with auto-refresh and column selector */}
                <Box display="flex" alignItems="center" mb={1}>
                    <Typography variant="h6">{title}</Typography>

                    <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
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

                        {/* Columns Button */}
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
                            {visibleDeviceCols.map((field, idx) => (
                                <ListItem key={field}>
                                    <Checkbox
                                        checked
                                        onChange={(e) => {
                                            handleToggleColumn(field, e.target.checked);
                                        }}
                                    />
                                    <ListItemText primary={defaultDeviceColumns.find((c) => c.field === field)!.label} />
                                    <IconButton
                                        size="small"
                                        disabled={idx === 0}
                                        onClick={() => handleMoveColumn(field, "up")}
                                    >
                                        <ArrowUpwardIcon fontSize="inherit" />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        disabled={idx === visibleDeviceCols.length - 1}
                                        onClick={() => handleMoveColumn(field, "down")}
                                    >
                                        <ArrowDownwardIcon fontSize="inherit" />
                                    </IconButton>
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
                                    const colDef = deviceColumns.find((c) => c.field === field)!; // ✅ Changed from defaultDeviceColumns

                                    // Define column widths - min-content plus buffer
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
                                            case "uniqueIdentifier":
                                                return { minWidth: 160, width: 'auto' };
                                            case "status":
                                                return { minWidth: 100, width: 100 };
                                            case "connMode":
                                                return { minWidth: 140, width: 'auto' };
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
                                        allColumns={deviceColumns} // ✅ Changed from defaultDeviceColumns
                                        connectionStatuses={connectionStatuses}
                                        onDelete={onDelete}
                                        onUpdate={onUpdate}
                                        navigate={navigate}
                                        updateStatuses={updateStatuses}
                                        updatingDevices={updatingDevices}
                                        onNestUnderGateway={handleNestUnderGateway}
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