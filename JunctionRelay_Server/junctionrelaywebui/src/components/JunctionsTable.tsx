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

import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from "react";
import {
    Typography,
    Box,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Button,
    Tooltip,
    IconButton,
    Chip,
    Switch,
    Alert,
    AlertColor,
    Snackbar,
    Card,
    CardContent,
} from "@mui/material";
import { Link, useNavigate, type NavigateFunction } from "react-router-dom";
import StopIcon from "@mui/icons-material/Stop";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HubIcon from '@mui/icons-material/Hub';
import DevicesIcon from '@mui/icons-material/Devices';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import {
    type ColumnDefinition,
    TABLE_CELL_SX,
    TABLE_HEADER_CELL_SX,
    TABLE_HEADER_ROW_SX,
    CARD_STYLES,
    getCardBaseSx,
    getCardContentSx,
    getIconButtonSx,
    type CardViewMode,
} from '@junctionrelay/styles';

// Type for sort direction
type SortDirection = 'asc' | 'desc';

// Type for view mode
export type ViewMode = 'table' | 'standard' | 'mini';

export const JUNCTION_COLUMNS: ColumnDefinition<string>[] = [
    { field: 'dashboard', label: 'Dashboard', width: 120 },
    { field: 'autoStart', label: 'Auto-Start', sortable: true, width: 140 },
    { field: 'name', label: 'Junction Name', sortable: true },
    { field: 'type', label: 'Type', sortable: true },
    { field: 'renderingMode', label: 'Rendering Mode', sortable: true },
    { field: 'layouts', label: 'Layouts' },
    { field: 'status', label: 'Status', sortable: true },
    { field: 'sources', label: 'Sources' },
    { field: 'targets', label: 'Targets' },
    { field: 'actions', label: 'Actions', align: 'right', pinned: 'end', alwaysVisible: true },
];

// Interfaces derived from backend C# DTOs (Controller_Junctions.cs)
interface ScreenLayoutSummary {
    frameLayoutId?: number;
    screenLayoutId?: number;
    frameLayoutName?: string;
    screenLayoutName?: string;
}

interface DeviceLinkSummary {
    deviceId: number;
    role: string;
    deviceName?: string;
    deviceStatus?: string;
    screenLayouts: ScreenLayoutSummary[];
}

interface CollectorLinkSummary {
    collectorId: number;
    role: string;
    collectorName?: string;
    collectorStatus?: string;
}

type JunctionLinkItem = DeviceLinkSummary | CollectorLinkSummary;

// Junction interface - keep sortOrder for backend
export interface Junction {
    id: number;
    name: string;
    description: string;
    type: string;
    renderingMode: string;
    status: string;
    deviceLinks?: DeviceLinkSummary[];
    collectorLinks?: CollectorLinkSummary[];
    showOnDashboard?: boolean;
    autoStartOnLaunch?: boolean;
    allTargetsAllData?: boolean;
    sortOrder: number;
    gatewayDestination?: string;
    gatewayDeviceId?: number;
    selectedGatewayDeviceId?: string;
}

// Props interface - pure data renderer, all controls managed by consumer
interface JunctionsTableProps {
    junctions: Junction[];
    onStartJunction: (id: number) => void;
    onStopJunction: (id: number) => void;
    onCloneJunction: (id: number) => void;
    onDeleteJunction: (id: number) => void;
    onUpdateSortOrders?: (updates: { junctionId: number, sortOrder: number }[]) => void;
    onJunctionAdded?: () => void;
    onDashboardToggle?: (junctionId: number, showOnDashboard: boolean) => Promise<void>;
    onAutoStartToggle?: (junctionId: number, autoStartOnLaunch: boolean) => Promise<void>;
    filteredJunctions?: Junction[];
    detailedConnections: boolean;
    setDetailedConnections: (value: boolean) => void;
    viewMode: ViewMode;
    showRunningOnly: boolean;
    visibleColumns: string[];
    allColumns: ColumnDefinition<string>[];
    sortStorageKey?: string;
    showAddButton?: boolean;
    showImportButton?: boolean;
}

// Helper function to get junction status info
const getJunctionStatusInfo = (
    status: string
): { label: string; color: "success" | "info" | "warning" | "error" | "default" } => {
    // Handle null/undefined status
    if (!status) {
        return { label: "Unknown", color: "default" };
    }

    // Convert to lowercase for case-insensitive matching
    const normalizedStatus = status.toString().toLowerCase().trim();

    // Status mapping for junctions
    const statusMap: Record<string, { label: string; color: "success" | "info" | "warning" | "error" | "default" }> = {
        // Success statuses (green)
        'running': { label: "Running", color: "success" },
        'active': { label: "Active", color: "success" },
        'online': { label: "Online", color: "success" },
        'connected': { label: "Connected", color: "success" },

        // Info statuses (blue)
        'idle': { label: "Idle", color: "info" },
        'stopped': { label: "Stopped", color: "info" },
        'ready': { label: "Ready", color: "info" },

        // Warning statuses (orange)
        'warning': { label: "Warning", color: "warning" },
        'pending': { label: "Pending", color: "warning" },
        'starting': { label: "Starting", color: "warning" },
        'stopping': { label: "Stopping", color: "warning" },

        // Error statuses (red)
        'error': { label: "Error", color: "error" },
        'failed': { label: "Failed", color: "error" },
        'disconnected': { label: "Error", color: "error" },

        // Default/offline statuses (gray)
        'offline': { label: "Offline", color: "default" },
        'unknown': { label: "Unknown", color: "default" }
    };

    // Look up the status in our mapping
    const statusInfo = statusMap[normalizedStatus];

    if (statusInfo) {
        return statusInfo;
    }

    // If no match found, return the original status with default styling
    // Capitalize first letter for display
    const displayLabel = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    return { label: displayLabel, color: "default" };
};

// Helper function to get device status info (for device links)
const getDeviceStatusInfo = (
    status: string
): { label: string; color: "success" | "info" | "warning" | "error" | "default" } => {
    // Handle null/undefined status
    if (!status) {
        return { label: "Unknown", color: "default" };
    }

    // Convert to lowercase for case-insensitive matching
    const normalizedStatus = status.toString().toLowerCase().trim();

    // Status mapping - completely case insensitive
    const statusMap: Record<string, { label: string; color: "success" | "info" | "warning" | "error" | "default" }> = {
        // Success statuses (green)
        'active': { label: "Active", color: "success" },
        'online': { label: "Online", color: "success" },
        'new_device': { label: "Active", color: "success" },
        'connected': { label: "Connected", color: "success" },

        // Info statuses (blue)
        'device_exists': { label: "Exists", color: "info" },
        'exists': { label: "Exists", color: "info" },

        // Warning statuses (orange)
        'needs_resync': { label: "Needs Resync", color: "warning" },
        'ip_in_use': { label: "Needs Resync", color: "warning" },
        'warning': { label: "Warning", color: "warning" },

        // Error statuses (red)
        'conflicting_records': { label: "Error", color: "error" },
        'error': { label: "Error", color: "error" },
        'failed': { label: "Error", color: "error" },

        // Default/offline statuses (gray)
        'offline': { label: "Offline", color: "default" },
        'disconnected': { label: "Offline", color: "default" },
        'unknown': { label: "Unknown", color: "default" }
    };

    // Look up the status in our mapping
    const statusInfo = statusMap[normalizedStatus];

    if (statusInfo) {
        return statusInfo;
    }

    // If no match found, return the original status with default styling
    // Capitalize first letter for display
    const displayLabel = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    return { label: displayLabel, color: "default" };
};


// Memoized component for rendering status
const StatusIndicator = memo(({ status }: { status: string }) => {
    const statusInfo = getJunctionStatusInfo(status);

    return (
        <Chip
            label={statusInfo.label}
            color={statusInfo.color}
            size="small"
            sx={{
                fontWeight: 'medium',
                fontSize: '0.75rem',
                height: 24
            }}
        />
    );
});

// Memoized component for rendering protocol icon
const ProtocolIcon = memo(({ type }: { type: string }) => {
    switch (type) {
        case 'MQTT Junction':
            return (
                <img
                    src="/Protocols/MQTT/svg/mqtt-icon-solid.svg"
                    alt="MQTT"
                    width="24"
                    height="24"
                    style={{ verticalAlign: 'middle' }}
                />
            );
        case 'HTTP Junction':
            return (
                <img
                    src="/Protocols/HTTP/svg/http-icon-solid.svg"
                    alt="HTTP"
                    width="24"
                    height="24"
                    style={{ verticalAlign: 'middle' }}
                />
            );
        case 'COM Junction':
            return (
                <img
                    src="/Protocols/COM/svg/com-icon-solid.svg"
                    alt="COM"
                    width="24"
                    height="24"
                    style={{ verticalAlign: 'middle' }}
                />
            );
        case 'WebSocket Junction':
            return (
                <img
                    src="/Protocols/WebSocket/svg/websocket-icon-solid.svg"
                    alt="WebSocket"
                    width="24"
                    height="24"
                    style={{ verticalAlign: 'middle' }}
                />
            );
        case 'Gateway Junction (HTTP to ESP:NOW)':
        case 'Gateway Junction (WebSocket to ESP:NOW)':
            return (
                <img
                    src="/Protocols/Gateway/svg/gateway-icon-solid.svg"
                    alt="Gateway"
                    width="24"
                    height="24"
                    style={{ verticalAlign: 'middle' }}
                />
            );
        default:
            return (
                <HubIcon
                    fontSize="small"
                    sx={{ width: 24, height: 24, verticalAlign: 'middle' }}
                />
            );
    }
});

// Memoized component for rendering links
const LinkList = memo(({ links, detailedConnections, hyperlinkRows }: {
    links: JunctionLinkItem[],
    detailedConnections: boolean,
    hyperlinkRows: boolean,
}) => {
    if (!links || links.length === 0) {
        return null;
    }

    if (detailedConnections) {
        return (
            <>
                {links.map((link) => {
                    const isDevice = 'deviceId' in link;
                    const name = isDevice ? link.deviceName : link.collectorName;
                    const id = isDevice ? link.deviceId : link.collectorId;
                    const url = isDevice ? `/configure-device/${id}` : `/configure-collector/${id}`;

                    // Get status from the junction link data (populated by backend)
                    const status = isDevice ?
                        (link.deviceStatus || 'unknown') :
                        (link.collectorStatus || 'unknown');

                    // Get status info for the device/collector
                    const statusInfo = getDeviceStatusInfo(status);

                    return (
                        <Box
                            key={`${isDevice ? "device" : "collector"}-${id}`}
                            sx={{ display: 'flex', alignItems: 'center', mb: 0.5, gap: 0.5 }}
                        >
                            {/* Status chip instead of colored circle */}
                            <Chip
                                label={statusInfo.label}
                                color={statusInfo.color}
                                size="small"
                                sx={{
                                    fontSize: '0.65rem',
                                    height: 18,
                                    minWidth: 'auto',
                                    '& .MuiChip-label': {
                                        px: 0.5
                                    }
                                }}
                            />
                            {hyperlinkRows ? (
                                <Link to={url} style={{ textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                                    <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                                        {name || `${isDevice ? 'Device' : 'Collector'} #${id}`}
                                    </Typography>
                                </Link>
                            ) : (
                                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                                    {name || `${isDevice ? 'Device' : 'Collector'} #${id}`}
                                </Typography>
                            )}
                        </Box>
                    );
                })}
            </>
        );
    } else {
        const deviceCount = links.filter(link => 'deviceId' in link).length;
        const collectorCount = links.filter(link => 'collectorId' in link).length;

        // Calculate overall health status for devices
        const getOverallDeviceStatus = () => {
            const deviceLinks = links.filter((link): link is DeviceLinkSummary => 'deviceId' in link);
            if (deviceLinks.length === 0) return 'default';

            const statuses = deviceLinks.map(link => {
                const status = (link.deviceStatus || 'unknown').toLowerCase();
                return getDeviceStatusInfo(status);
            });

            // If any device has error status, show red
            if (statuses.some(s => s.color === 'error')) return 'error';
            // If any device has warning status, show orange
            if (statuses.some(s => s.color === 'warning')) return 'warning';
            // If any device is unknown/offline, show gray
            if (statuses.some(s => s.color === 'default')) return 'default';
            // If all devices are success/info, show green
            return 'success';
        };

        // Calculate overall health status for collectors
        const getOverallCollectorStatus = () => {
            const collectorLinks = links.filter((link): link is CollectorLinkSummary => 'collectorId' in link);
            if (collectorLinks.length === 0) return 'default';

            const statuses = collectorLinks.map(link => {
                const status = (link.collectorStatus || 'unknown').toLowerCase();
                return getDeviceStatusInfo(status);
            });

            // If any collector has error status, show red
            if (statuses.some(s => s.color === 'error')) return 'error';
            // If any collector has warning status, show orange
            if (statuses.some(s => s.color === 'warning')) return 'warning';
            // If any collector is unknown/offline, show gray
            if (statuses.some(s => s.color === 'default')) return 'default';
            // If all collectors are success/info, show green
            return 'success';
        };

        return (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {deviceCount > 0 && (
                    <Chip
                        icon={<DevicesIcon fontSize="small" />}
                        label={`${deviceCount} device${deviceCount !== 1 ? 's' : ''}`}
                        size="small"
                        color={getOverallDeviceStatus() as "success" | "info" | "warning" | "error" | "default"}
                        variant="filled"
                    />
                )}
                {collectorCount > 0 && (
                    <Chip
                        icon={<HubIcon fontSize="small" />}
                        label={`${collectorCount} collector${collectorCount !== 1 ? 's' : ''}`}
                        size="small"
                        color={getOverallCollectorStatus() as "success" | "info" | "warning" | "error" | "default"}
                        variant="filled"
                    />
                )}
            </Box>
        );
    }
});

// Memoized TableRow component without drag and drop
const JunctionTableRow = memo(({
    junction,
    visibleCols,
    allColumns,
    onStartJunction,
    onStopJunction,
    onCloneJunction,
    onDeleteJunction,
    onAutoStartToggle,
    onDashboardToggle,
    detailedConnections,
    navigate,
    hyperlinkRows,
    showSnackbar
}: {
    junction: Junction,
    visibleCols: string[],
    allColumns: ColumnDefinition<string>[],
    onStartJunction: (id: number) => void,
    onStopJunction: (id: number) => void,
    onCloneJunction: (id: number) => void,
    onDeleteJunction: (id: number) => void,
    onAutoStartToggle?: (e: React.ChangeEvent<HTMLInputElement>, junction: Junction) => void,
    onDashboardToggle?: (e: React.ChangeEvent<HTMLInputElement>, junction: Junction) => void,
    detailedConnections: boolean,
    navigate: NavigateFunction,
    hyperlinkRows: boolean,
    showSnackbar: (message: string, severity: AlertColor) => void
}) => {
    // Memoize cell rendering functions to prevent recreation on each render
    const getJunctionCell = useCallback((field: string) => {
        switch (field) {
            case "dashboard":
                return (
                    <Tooltip title={junction.showOnDashboard ? "Shown on dashboard" : "Hidden from dashboard"}>
                        <Switch
                            size="small"
                            checked={junction.showOnDashboard || false}
                            onChange={(e) => {
                                if (onDashboardToggle) {
                                    onDashboardToggle(e, junction);
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            color="primary"
                            aria-label="Show on dashboard"
                        />
                    </Tooltip>
                );
            case "name":
                return <Typography fontWeight="medium">{junction.name}</Typography>;
            case "autoStart":
                return (
                    <Tooltip title={junction.autoStartOnLaunch ? "Auto-start enabled" : "Auto-start disabled"}>
                        <Switch
                            size="small"
                            checked={junction.autoStartOnLaunch || false}
                            onChange={(e) => {
                                if (onAutoStartToggle) {
                                    onAutoStartToggle(e, junction);
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            color="primary"
                            aria-label="Auto-start on launch"
                        />
                    </Tooltip>
                );
            case "description":
                return junction.description || "";
            case "type":
                return (
                    <Box display="flex" alignItems="center" gap={1}>
                        <ProtocolIcon type={junction.type || ''} />
                        <Typography variant="body2">{junction.type || 'Unknown'}</Typography>
                    </Box>
                );
            case "renderingMode":
                return junction.renderingMode || "";
            case "status":
                return <StatusIndicator status={junction.status} />;
            case "sources":
                return (
                    <LinkList
                        links={[
                            ...(junction.deviceLinks?.filter(l => l.role === "Source") || []),
                            ...(junction.collectorLinks?.filter(l => l.role === "Source") || []),
                        ]}
                        detailedConnections={detailedConnections}
                        hyperlinkRows={hyperlinkRows}
                    />
                );
            case "targets":
                return (
                    <LinkList
                        links={[
                            ...(junction.deviceLinks?.filter(l => l.role === "Target") || []),
                            ...(junction.collectorLinks?.filter(l => l.role === "Target") || []),
                        ]}
                        detailedConnections={detailedConnections}
                        hyperlinkRows={hyperlinkRows}
                    />
                );
            case "layouts":
                // Determine if we should show layouts based on rendering mode
                const isFrameMode = junction.renderingMode === "Blit" || junction.renderingMode === "Composite";
                const isPayloadMode = junction.renderingMode === "Payload";

                // Collect all unique layouts with their details from device links
                const layoutMap = new Map<number, { id: number, name: string, type: string }>();

                junction.deviceLinks?.forEach(link => {
                    link.screenLayouts?.forEach(sl => {
                        // For frame modes (Blit/Composite), show frame layouts
                        if (isFrameMode && sl.frameLayoutId && !layoutMap.has(sl.frameLayoutId)) {
                            layoutMap.set(sl.frameLayoutId, {
                                id: sl.frameLayoutId,
                                name: sl.frameLayoutName || `Layout #${sl.frameLayoutId}`,
                                type: 'Frame'
                            });
                        }
                        // For payload mode, show screen layouts
                        if (isPayloadMode && sl.screenLayoutId && !layoutMap.has(sl.screenLayoutId)) {
                            layoutMap.set(sl.screenLayoutId, {
                                id: sl.screenLayoutId,
                                name: sl.screenLayoutName || `Layout #${sl.screenLayoutId}`,
                                type: 'Payload'
                            });
                        }
                    });
                });

                const layouts = Array.from(layoutMap.values());

                if (layouts.length === 0) {
                    return <Typography variant="body2" color="text.secondary">None</Typography>;
                }

                if (detailedConnections) {
                    // Detailed view - show each layout individually with name
                    return (
                        <>
                            {layouts.map((layout) => (
                                <Box
                                    key={`layout-${layout.id}`}
                                    sx={{ display: 'flex', alignItems: 'center', mb: 0.5, gap: 0.5 }}
                                >
                                    <Chip
                                        label={layout.type}
                                        color="primary"
                                        size="small"
                                        sx={{
                                            fontSize: '0.65rem',
                                            height: 18,
                                            minWidth: 'auto',
                                            '& .MuiChip-label': {
                                                px: 0.5
                                            }
                                        }}
                                    />
                                    <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                                        {layout.name}
                                    </Typography>
                                </Box>
                            ))}
                        </>
                    );
                } else {
                    // Compact view - show count with icon
                    return (
                        <Chip
                            icon={<ViewModuleIcon fontSize="small" />}
                            label={`${layouts.length} layout${layouts.length !== 1 ? 's' : ''}`}
                            size="small"
                            color="primary"
                            variant="filled"
                        />
                    );
                }
            case "actions":
                return (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/configure-junction/${junction.id}`);
                                }}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Clone">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onCloneJunction(junction.id);
                                }}
                            >
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={junction.status === "Running" ? "Cannot delete a running junction" : "Delete"}>
                            <span style={{ display: 'inline-flex' }}>
                                <IconButton
                                    size="small"
                                    disabled={junction.status === "Running"}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (junction.status === "Running") {
                                            showSnackbar("Cannot delete a running junction. Please stop it first.", "error");
                                            return;
                                        }
                                        if (window.confirm("Are you sure you want to delete this junction?")) {
                                            onDeleteJunction(junction.id);
                                        }
                                    }}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Button
                            variant="contained"
                            color="error"
                            onClick={(e) => {
                                e.stopPropagation();
                                onStopJunction(junction.id);
                            }}
                            disabled={junction.status === "Idle"}
                            sx={{ minWidth: 30, p: "6px 10px", ml: 1 }}
                            size="small"
                        >
                            <StopIcon />
                        </Button>
                        <Button
                            variant="contained"
                            color="success"
                            onClick={(e) => {
                                e.stopPropagation();
                                onStartJunction(junction.id);
                            }}
                            disabled={junction.status === "Running"}
                            sx={{ minWidth: 30, p: "6px 10px", ml: 1 }}
                            size="small"
                        >
                            <PlayArrowIcon />
                        </Button>
                    </Box>
                );
            default:
                return null;
        }
    }, [junction, detailedConnections, navigate, onStartJunction, onStopJunction, onCloneJunction, onDeleteJunction, onDashboardToggle, hyperlinkRows]);

    return (
        <TableRow
            hover
            onClick={() => navigate(`/configure-junction/${junction.id}`)}
            sx={{
                cursor: "pointer"
            }}
        >
            {visibleCols.map((field) => {
                const colDef = allColumns.find((c) => c.field === field)!;
                return (
                    <TableCell
                        key={field}
                        align={colDef.align ?? 'left'}
                        sx={{
                            ...TABLE_CELL_SX,
                            width: colDef.width,
                            minWidth: colDef.minWidth,
                            maxWidth: colDef.width
                        }}
                    >
                        {getJunctionCell(field)}
                    </TableCell>
                );
            })}
        </TableRow>
    );
});

// JunctionsTable — pure data renderer, no internal header bar
const JunctionsTable: React.FC<JunctionsTableProps> = ({
    junctions,
    onStartJunction,
    onStopJunction,
    onCloneJunction,
    onDeleteJunction,
    onUpdateSortOrders,
    onDashboardToggle,
    onAutoStartToggle,
    filteredJunctions,
    detailedConnections,
    viewMode,
    showRunningOnly,
    visibleColumns,
    allColumns,
    sortStorageKey = 'junction_sort_state',
}) => {
    const navigate = useNavigate();
    const flags = useFeatureFlags();
    const hyperlinkRowsEnabled = flags?.junction_hyperlink_rows !== false;
    const isInitialRender = useRef(true);

    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");

    // Calculate grid columns based on view mode (for tile views)
    const getGridColumns = () => {
        if (viewMode === 'mini') {
            return {
                xs: 'repeat(2, 1fr)', // 2 columns on mobile for mini tiles
                sm: 'repeat(3, 1fr)', // 3 columns on small screens
                md: 'repeat(4, 1fr)', // 4 columns on medium screens
                lg: 'repeat(6, 1fr)'  // 6 columns on large screens
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

    // Show snackbar with configurable severity
    const showSnackbar = useCallback((message: string, severity: AlertColor = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    }, []);

    // Use the filtered junctions or all junctions
    const displayJunctions = useMemo(() => {
        const baseJunctions = filteredJunctions || junctions;

        // NEW: Apply running only filter if enabled
        if (showRunningOnly) {
            return baseJunctions.filter(junction =>
                junction.status?.toLowerCase() === 'running'
            );
        }

        return baseJunctions;
    }, [filteredJunctions, junctions, showRunningOnly]);

    // State for sorting
    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(sortStorageKey);
            return stored ? JSON.parse(stored) : { orderBy: 'name', order: 'asc' };
        } catch (e) {
            return { orderBy: 'name', order: 'asc' };
        }
    });

    // Sort the junction rows
    const sortedJunctions = useMemo(() => {
        const { orderBy, order } = sortState;
        const comparator = (a: Junction, b: Junction) => {
            let valueA: string | number = '';
            let valueB: string | number = '';

            // Extract the values to compare based on orderBy
            switch (orderBy) {
                case 'name':
                    valueA = a.name?.toLowerCase() || '';
                    valueB = b.name?.toLowerCase() || '';
                    break;
                case 'autoStart':
                    valueA = a.autoStartOnLaunch ? 1 : 0;
                    valueB = b.autoStartOnLaunch ? 1 : 0;
                    break;
                case 'description':
                    valueA = a.description?.toLowerCase() || '';
                    valueB = b.description?.toLowerCase() || '';
                    break;
                case 'type':
                    valueA = a.type?.toLowerCase() || '';
                    valueB = b.type?.toLowerCase() || '';
                    break;
                case 'renderingMode':
                    valueA = a.renderingMode?.toLowerCase() || '';
                    valueB = b.renderingMode?.toLowerCase() || '';
                    break;
                case 'status':
                    valueA = a.status?.toLowerCase() || '';
                    valueB = b.status?.toLowerCase() || '';
                    break;
                default:
                    valueA = String(a[orderBy as keyof Junction] ?? '');
                    valueB = String(b[orderBy as keyof Junction] ?? '');
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
        return [...displayJunctions].sort(comparator);
    }, [displayJunctions, sortState]);

    // Persist sort state when it changes
    useEffect(() => {
        localStorage.setItem(sortStorageKey, JSON.stringify(sortState));
    }, [sortState, sortStorageKey]);

    // Update database sort orders when sort state changes - FIXED VERSION
    useEffect(() => {
        if (!onUpdateSortOrders) return;

        // Don't update if there are no junctions
        if (displayJunctions.length === 0) return;

        // Check if this is the initial render
        if (isInitialRender.current) {
            isInitialRender.current = false;
            return;
        }

        // Debounce the updates to avoid frequent API calls
        const debounceTimer = setTimeout(() => {
            // Calculate all updates in a single batch using current sorted junctions
            const SPACING = 1000;
            const updates = sortedJunctions.map((junction, index) => ({
                junctionId: junction.id,
                sortOrder: (index + 1) * SPACING
            }));

            // Send only one batch update to the parent
            if (updates.length > 0) {
                onUpdateSortOrders(updates);
            }
        }, 2000); // Increased debounce to 2 seconds

        return () => clearTimeout(debounceTimer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sortState, onUpdateSortOrders, displayJunctions.length]); // Intentionally excluding sortedJunctions to prevent status update loops


    // Handle sort request
    const handleRequestSort = useCallback((property: string) => {
        const isAsc = sortState.orderBy === property && sortState.order === 'asc';
        setSortState({
            orderBy: property,
            order: isAsc ? 'desc' : 'asc'
        });
    }, [sortState]);

    // Memoized handlers for junction actions
    const memoizedStartJunction = useCallback((id: number) => {
        onStartJunction(id);
    }, [onStartJunction]);

    const memoizedStopJunction = useCallback((id: number) => {
        onStopJunction(id);
    }, [onStopJunction]);

    const memoizedCloneJunction = useCallback((id: number) => {
        onCloneJunction(id);
    }, [onCloneJunction]);

    const memoizedDeleteJunction = useCallback((id: number) => {
        onDeleteJunction(id);
    }, [onDeleteJunction]);

    // Junction tile click handler
    const handleJunctionClick = (id: number) => {
        navigate(`/configure-junction/${id}`);
    };

    // FIXED: Dashboard toggle handler using the prop callback
    const handleDashboardToggle = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, junction: Junction) => {
        e.stopPropagation();

        if (onDashboardToggle) {
            try {
                await onDashboardToggle(junction.id, e.target.checked);
            } catch (error) {
                console.error("Failed to toggle dashboard status:", error);
                showSnackbar("Error updating junction dashboard status", "error");
            }
        }
    }, [onDashboardToggle, showSnackbar]);

    const handleAutoStartToggle = useCallback(async (e: React.ChangeEvent<HTMLInputElement>, junction: Junction) => {
        e.stopPropagation();

        if (onAutoStartToggle) {
            try {
                await onAutoStartToggle(junction.id, e.target.checked);
            } catch (error) {
                console.error("Failed to toggle auto-start status:", error);
                showSnackbar("Error updating junction auto-start status", "error");
            }
        }
    }, [onAutoStartToggle, showSnackbar]);

    return (
        <>
            {/* Junction Content - Table or Tiles */}
            {viewMode === 'table' ? (
                /* Table View */
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={TABLE_HEADER_ROW_SX}>
                                {visibleColumns.map((field) => {
                                    const colDef = allColumns.find((c) => c.field === field)!;
                                    return (
                                        <TableCell
                                            key={field}
                                            align={colDef.align ?? 'left'}
                                            sortDirection={sortState.orderBy === field ? sortState.order : false}
                                            sx={{
                                                ...TABLE_HEADER_CELL_SX,
                                                width: colDef.width,
                                                minWidth: colDef.minWidth,
                                                maxWidth: colDef.width
                                            }}
                                        >
                                            {colDef.sortable ? (
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
                            {sortedJunctions.length > 0 ? (
                                sortedJunctions.map((junction) => (
                                    <JunctionTableRow
                                        key={junction.id}
                                        junction={junction}
                                        visibleCols={visibleColumns}
                                        allColumns={allColumns}
                                        onStartJunction={memoizedStartJunction}
                                        onStopJunction={memoizedStopJunction}
                                        onCloneJunction={memoizedCloneJunction}
                                        onDeleteJunction={memoizedDeleteJunction}
                                        onAutoStartToggle={handleAutoStartToggle}
                                        onDashboardToggle={handleDashboardToggle}
                                        detailedConnections={detailedConnections}
                                        navigate={navigate}
                                        hyperlinkRows={hyperlinkRowsEnabled}
                                        showSnackbar={showSnackbar}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={visibleColumns.length} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">
                                            {showRunningOnly ? 'No running junctions to display' : 'No junctions to display'}
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
                    mb: 3
                }}>
                    {sortedJunctions.length > 0 ? (
                        sortedJunctions.map(junction => {
                            const statusInfo = getJunctionStatusInfo(junction.status);

                            return (
                                <Card
                                    key={junction.id}
                                    variant="outlined"
                                    sx={{
                                        ...getCardBaseSx(viewMode as CardViewMode),
                                        cursor: 'pointer',
                                        border: junction.status === 'Running' ? '2px solid' : undefined,
                                        borderColor: junction.status === 'Running' ? 'success.main' : undefined,
                                    }}
                                    onClick={() => handleJunctionClick(junction.id)}
                                >
                                    {/* Status Badge */}
                                    <Box
                                        sx={{
                                            position: 'absolute',
                                            top: viewMode === 'mini' ? 4 : 8,
                                            right: viewMode === 'mini' ? 4 : 8,
                                            zIndex: 1
                                        }}
                                    >
                                        <Chip
                                            label={statusInfo.label}
                                            color={statusInfo.color}
                                            size="small"
                                            sx={{
                                                fontSize: CARD_STYLES[viewMode as CardViewMode].chip.fontSize,
                                                height: CARD_STYLES[viewMode as CardViewMode].chip.height,
                                                fontWeight: 'bold'
                                            }}
                                        />
                                    </Box>

                                    <CardContent sx={{
                                        ...getCardContentSx(viewMode as CardViewMode),
                                        pt: viewMode === 'mini' ? 3 : 5,
                                    }}>
                                        {/* Junction Name */}
                                        <Typography
                                            variant={CARD_STYLES[viewMode as CardViewMode].title.variant}
                                            sx={CARD_STYLES[viewMode as CardViewMode].title.sx}
                                        >
                                            {junction.name}
                                        </Typography>

                                        {/* Protocol Icon and Type */}
                                        <Box sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 0.5,
                                            mb: viewMode === 'mini' ? 0.5 : 1
                                        }}>
                                            <ProtocolIcon type={junction.type || ''} />
                                            {viewMode === 'standard' && (
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontSize: '0.75rem',
                                                        color: 'text.secondary'
                                                    }}
                                                >
                                                    {junction.type}
                                                </Typography>
                                            )}
                                        </Box>
                                        {/* Rendering Mode */}
                                        <Typography
                                            variant={CARD_STYLES[viewMode as CardViewMode].title.variant}
                                            sx={CARD_STYLES[viewMode as CardViewMode].title.sx}
                                        >
                                            {junction.renderingMode}
                                        </Typography>

                                        {/* Description (only in standard mode) */}
                                        {CARD_STYLES[viewMode as CardViewMode].showDescription && junction.description && (
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontSize: '0.75rem',
                                                    color: 'text.secondary',
                                                    mb: 1,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical'
                                                }}
                                            >
                                                {junction.description}
                                            </Typography>
                                        )}

                                        {/* Connection Info */}
                                        <Box sx={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: viewMode === 'mini' ? 0.5 : 1,
                                            mb: 2
                                        }}>
                                            {/* Sources */}
                                            <LinkList
                                                links={[
                                                    ...(junction.deviceLinks?.filter(l => l.role === "Source") || []),
                                                    ...(junction.collectorLinks?.filter(l => l.role === "Source") || []),
                                                ]}
                                                detailedConnections={false} // Always use compact mode in tiles
                                                hyperlinkRows={hyperlinkRowsEnabled}
                                            />

                                            {/* Targets */}
                                            <LinkList
                                                links={[
                                                    ...(junction.deviceLinks?.filter(l => l.role === "Target") || []),
                                                    ...(junction.collectorLinks?.filter(l => l.role === "Target") || []),
                                                ]}
                                                detailedConnections={false} // Always use compact mode in tiles
                                                hyperlinkRows={hyperlinkRowsEnabled}
                                            />
                                        </Box>
                                    </CardContent>

                                    {/* Action Buttons at Bottom */}
                                    <Box sx={{
                                        p: viewMode === 'mini' ? 0.5 : 1,
                                        pt: 0,
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: CARD_STYLES[viewMode as CardViewMode].buttonGap
                                    }}>
                                        {/* Left side: Edit, Clone, Delete buttons */}
                                        <Box sx={{ display: 'flex', gap: CARD_STYLES[viewMode as CardViewMode].buttonGap }}>
                                            <Tooltip title="Edit">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/configure-junction/${junction.id}`);
                                                    }}
                                                    sx={getIconButtonSx('primary', viewMode as CardViewMode)}
                                                >
                                                    <EditIcon sx={{ fontSize: CARD_STYLES[viewMode as CardViewMode].iconButton.iconSize }} />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Clone">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onCloneJunction(junction.id);
                                                    }}
                                                    sx={getIconButtonSx('secondary', viewMode as CardViewMode)}
                                                >
                                                    <ContentCopyIcon sx={{ fontSize: CARD_STYLES[viewMode as CardViewMode].iconButton.iconSize }} />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete">
                                                <IconButton
                                                    size="small"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (window.confirm("Are you sure you want to delete this junction?")) {
                                                            onDeleteJunction(junction.id);
                                                        }
                                                    }}
                                                    sx={getIconButtonSx('error', viewMode as CardViewMode)}
                                                >
                                                    <DeleteIcon sx={{ fontSize: CARD_STYLES[viewMode as CardViewMode].iconButton.iconSize }} />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>

                                        {/* Right side: Stop and Play buttons */}
                                        <Box sx={{ display: 'flex', gap: CARD_STYLES[viewMode as CardViewMode].buttonGap }}>
                                            <Button
                                                variant="contained"
                                                color="error"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    memoizedStopJunction(junction.id);
                                                }}
                                                disabled={junction.status === "Idle"}
                                                sx={{
                                                    minWidth: viewMode === 'mini' ? 24 : 30,
                                                    p: viewMode === 'mini' ? "4px 6px" : "6px 10px",
                                                    fontSize: viewMode === 'mini' ? '0.7rem' : '0.875rem'
                                                }}
                                                size="small"
                                            >
                                                <StopIcon sx={{ fontSize: viewMode === 'mini' ? '0.9rem' : '1rem' }} />
                                            </Button>
                                            <Button
                                                variant="contained"
                                                color="success"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    memoizedStartJunction(junction.id);
                                                }}
                                                disabled={junction.status === "Running"}
                                                sx={{
                                                    minWidth: viewMode === 'mini' ? 24 : 30,
                                                    p: viewMode === 'mini' ? "4px 6px" : "6px 10px",
                                                    fontSize: viewMode === 'mini' ? '0.7rem' : '0.875rem'
                                                }}
                                                size="small"
                                            >
                                                <PlayArrowIcon sx={{ fontSize: viewMode === 'mini' ? '0.9rem' : '1rem' }} />
                                            </Button>
                                        </Box>
                                    </Box>
                                </Card>
                            );
                        })
                    ) : (
                        <Box sx={{
                            gridColumn: '1 / -1',
                            textAlign: 'center',
                            py: 3
                        }}>
                            <Typography color="textSecondary">
                                {showRunningOnly ? 'No running junctions to display' : 'No junctions to display'}
                            </Typography>
                        </Box>
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
        </>
    );
};

export default JunctionsTable;