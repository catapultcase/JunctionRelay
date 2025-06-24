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

import { useState, useEffect, MouseEvent, useCallback, useMemo, memo, useRef } from "react";
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
    Paper,
    Button,
    Tooltip,
    Checkbox,
    ListItemText,
    Popover,
    List,
    ListItem,
    IconButton,
    Chip,
    Switch,
    FormControlLabel,
    Modal,
    TextField,
    CircularProgress,
    Alert,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
    AlertColor,
    Snackbar,
} from "@mui/material";
import { Link, useNavigate } from "react-router-dom";
import StopIcon from "@mui/icons-material/Stop";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HubIcon from '@mui/icons-material/Hub';
import DevicesIcon from '@mui/icons-material/Devices';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

import { useFeatureFlags } from "../hooks/useFeatureFlags";

// Define column interface
export interface JunctionColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    renderCell?: (junction: Junction) => React.ReactNode; // Custom cell renderer
    sortable?: boolean; // Whether this column can be sorted
}

// Type for sort direction
type SortDirection = 'asc' | 'desc';

// Junction interface - keep sortOrder for backend
export interface Junction {
    id: number;
    name: string;
    description: string;
    type: string;
    status: string;
    deviceLinks?: any[];
    collectorLinks?: any[];
    showOnDashboard?: boolean;
    autoStartOnLaunch?: boolean;
    allTargetsAllData?: boolean;
    sortOrder: number;
    gatewayDestination?: string;
    selectedGatewayDeviceId?: string;
}

// Props interface - updated to include devices and collectors
interface JunctionsTableProps {
    junctions: Junction[];
    onStartJunction: (id: number) => void;
    onStopJunction: (id: number) => void;
    onCloneJunction: (id: number) => void;
    onDeleteJunction: (id: number) => void;
    onUpdateSortOrders?: (updates: { junctionId: number, sortOrder: number }[]) => void;
    onJunctionAdded?: () => void; // Callback when a junction is added
    filteredJunctions?: Junction[];
    localStorageKey?: string;
    detailedConnections: boolean;
    setDetailedConnections: (value: boolean) => void;
    additionalColumns?: JunctionColumn[];
    devices?: any[]; // Add devices array to look up device status
    collectors?: any[]; // Add collectors array to look up collector status
    showAddButton?: boolean; // Whether to show the Add Junction button
    showImportButton?: boolean; // Whether to show the Import Junction button
}

const STORAGE_KEY_DEFAULT = "dashboard_visible_junction_cols";
const STORAGE_KEY_SORT = "junction_sort_state";

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

// Utility to move an item up/down in the visible list
const moveCol = (
    field: string,
    list: string[],
    setList: (a: string[]) => void,
    direction: "up" | "down"
) => {
    const i = list.indexOf(field);
    if (i < 0) return;
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    const copy = [...list];
    copy.splice(i, 1);
    copy.splice(j, 0, field);
    setList(copy);
};

// Define column definitions outside the component to prevent recreation
const defaultJunctionCols: JunctionColumn[] = [
    { field: "name", label: "Junction Name", align: "left", sortable: true },
    { field: "description", label: "Description", align: "left", sortable: true },
    { field: "type", label: "Type", align: "left", sortable: true },
    { field: "status", label: "Status", align: "left", sortable: true },
    { field: "sources", label: "Sources", align: "left", sortable: false },
    { field: "targets", label: "Targets", align: "left", sortable: false },
    { field: "actions", label: "Actions", align: "right", sortable: false },
];

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
        case 'Websocket Junction':
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
        case 'Gateway Junction (Websocket to ESP:NOW)':
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
const LinkList = memo(({ links, detailedConnections, hyperlinkRows, devices, collectors }: {
    links: any[],
    detailedConnections: boolean,
    hyperlinkRows: boolean,
    devices?: any[],
    collectors?: any[]
}) => {
    if (!links || links.length === 0) {
        return null;
    }

    if (detailedConnections) {
        return (
            <>
                {links.map((link) => {
                    const isDevice = link.deviceId != null;
                    const name = isDevice ? link.deviceName : link.collectorName;
                    const id = isDevice ? link.deviceId : link.collectorId;
                    const url = isDevice ? `/configure-device/${id}` : `/configure-collector/${id}`;

                    // Get status from the junction link data (populated by backend)
                    const status = isDevice ?
                        (link.deviceStatus || link.DeviceStatus || 'unknown') :
                        (link.collectorStatus || link.CollectorStatus || 'unknown');

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
        const deviceCount = links.filter(link => link.deviceId != null).length;
        const collectorCount = links.filter(link => link.collectorId != null).length;

        // Calculate overall health status for devices
        const getOverallDeviceStatus = () => {
            const deviceLinks = links.filter(link => link.deviceId != null);
            if (deviceLinks.length === 0) return 'default';

            const statuses = deviceLinks.map(link => {
                const status = (link.deviceStatus || link.DeviceStatus || 'unknown').toLowerCase();
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
            const collectorLinks = links.filter(link => link.collectorId != null);
            if (collectorLinks.length === 0) return 'default';

            const statuses = collectorLinks.map(link => {
                const status = (link.collectorStatus || link.CollectorStatus || 'unknown').toLowerCase();
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
    detailedConnections,
    navigate,
    hyperlinkRows,
    devices,
    collectors
}: {
    junction: Junction,
    visibleCols: string[],
    allColumns: JunctionColumn[],
    onStartJunction: (id: number) => void,
    onStopJunction: (id: number) => void,
    onCloneJunction: (id: number) => void,
    onDeleteJunction: (id: number) => void,
    detailedConnections: boolean,
    navigate: any,
    hyperlinkRows: boolean,
    devices?: any[],
    collectors?: any[]
}) => {
    // Memoize cell rendering functions to prevent recreation on each render
    const getJunctionCell = useCallback((field: string) => {
        // First check if there's a custom renderer for this field
        const column = allColumns.find(col => col.field === field);
        if (column && column.renderCell) {
            return column.renderCell(junction);
        }

        // Otherwise use the standard renderers
        switch (field) {
            case "name":
                return <Typography fontWeight="medium">{junction.name}</Typography>;
            case "description":
                return junction.description || "";
            case "type":
                return (
                    <Box display="flex" alignItems="center" gap={1}>
                        <ProtocolIcon type={junction.type || ''} />
                        <Typography variant="body2">{junction.type || 'Unknown'}</Typography>
                    </Box>
                );
            case "status":
                return <StatusIndicator status={junction.status} />;
            case "sources":
                return (
                    <LinkList
                        links={[
                            ...(junction.deviceLinks?.filter((l: any) => l.role === "Source") || []),
                            ...(junction.collectorLinks?.filter((l: any) => l.role === "Source") || []),
                        ]}
                        detailedConnections={detailedConnections}
                        hyperlinkRows={hyperlinkRows}
                        devices={devices}
                        collectors={collectors}
                    />
                );
            case "targets":
                return (
                    <LinkList
                        links={[
                            ...(junction.deviceLinks?.filter((l: any) => l.role === "Target") || []),
                            ...(junction.collectorLinks?.filter((l: any) => l.role === "Target") || []),
                        ]}
                        detailedConnections={detailedConnections}
                        hyperlinkRows={hyperlinkRows}
                        devices={devices}
                        collectors={collectors}
                    />
                );
            case "actions":
                // Get the alignment from the column definition (which uses the feature flag)
                const actionColumn = allColumns.find(col => col.field === field);
                const alignment = actionColumn?.align || 'right';

                // Convert alignment to flexbox justify-content value
                const justifyContent = alignment === 'left' ? 'flex-start' :
                    alignment === 'center' ? 'center' : 'flex-end';

                return (
                    <Box sx={{ display: 'flex', justifyContent }}>
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
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm("Are you sure you want to delete this junction?")) {
                                        onDeleteJunction(junction.id);
                                    }
                                }}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
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
    }, [junction, detailedConnections, navigate, onStartJunction, onStopJunction, onCloneJunction, onDeleteJunction, allColumns, hyperlinkRows, devices, collectors]);

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
                        align={colDef.align}
                    >
                        {getJunctionCell(field)}
                    </TableCell>
                );
            })}
        </TableRow>
    );
});

const JunctionsTable: React.FC<JunctionsTableProps> = ({
    junctions,
    onStartJunction,
    onStopJunction,
    onCloneJunction,
    onDeleteJunction,
    onUpdateSortOrders,
    onJunctionAdded,
    filteredJunctions,
    localStorageKey = STORAGE_KEY_DEFAULT,
    detailedConnections,
    setDetailedConnections,
    additionalColumns = [],
    devices = [],
    collectors = [],
    showAddButton = true,
    showImportButton = true
}) => {
    const navigate = useNavigate();

    const flags = useFeatureFlags();
    const hyperlinkRowsEnabled = flags?.hyperlink_rows !== false;
    const junctionImportExportEnabled = flags?.junction_import_export !== false;

    // Add useRef at the component level, outside any effects
    const isInitialRender = useRef(true);

    // Junction creation state
    const [addJunctionModalOpen, setAddJunctionModalOpen] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [importing, setImporting] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Gateway devices state
    const [gatewayDevices, setGatewayDevices] = useState<any[]>([]);

    // State for the add junction form
    const [newJunction, setNewJunction] = useState<Partial<Junction>>({
        name: "",
        description: "",
        type: "COM Junction",
        showOnDashboard: true,
        autoStartOnLaunch: false,
        allTargetsAllData: false,
        deviceLinks: [],
        collectorLinks: [],
        sortOrder: 0,
        gatewayDestination: "",
        selectedGatewayDeviceId: ""
    });

    // Load gateway devices when component mounts
    useEffect(() => {
        const loadGatewayDevices = async () => {
            try {
                const response = await fetch("/api/devices");
                if (response.ok) {
                    const devices = await response.json();
                    // Filter devices where IsGateway = true
                    const gateways = devices.filter((device: any) => device.isGateway === true);
                    setGatewayDevices(gateways);
                }
            } catch (error) {
                console.error("Error loading gateway devices:", error);
            }
        };

        loadGatewayDevices();
    }, []);

    // Show snackbar with configurable severity
    const showSnackbar = useCallback((message: string, severity: AlertColor = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    }, []);

    // Create dynamic junction columns based on feature flags
    const junctionCols = useMemo(() => {
        const actionsAlignment = flags?.junction_actions_alignment?.toLowerCase() === 'left' ? 'left' : 'right';

        const baseColumns = [...additionalColumns, ...defaultJunctionCols];

        return baseColumns.map(col =>
            col.field === 'actions'
                ? { ...col, align: actionsAlignment as "left" | "right" | "center" | "inherit" | "justify" }
                : col
        );
    }, [additionalColumns, flags?.junction_actions_alignment]);

    // THEN define visibleJunctionCols, now that junctionCols is defined
    const [visibleJunctionCols, setVisibleJunctionCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(localStorageKey);
        return stored ? JSON.parse(stored) : junctionCols.map((c) => c.field);
    });

    // Use the filtered junctions or all junctions
    const displayJunctions = useMemo(() => {
        return filteredJunctions || junctions;
    }, [filteredJunctions, junctions]);

    // State for sorting
    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(`${localStorageKey}_${STORAGE_KEY_SORT}`);
            return stored ? JSON.parse(stored) : { orderBy: 'name', order: 'asc' };
        } catch (e) {
            return { orderBy: 'name', order: 'asc' };
        }
    });

    // Sort the junction rows
    const sortedJunctions = useMemo(() => {
        const { orderBy, order } = sortState;
        const comparator = (a: Junction, b: Junction) => {
            let valueA: any;
            let valueB: any;

            // Extract the values to compare based on orderBy
            switch (orderBy) {
                case 'name':
                    valueA = a.name?.toLowerCase() || '';
                    valueB = b.name?.toLowerCase() || '';
                    break;
                case 'description':
                    valueA = a.description?.toLowerCase() || '';
                    valueB = b.description?.toLowerCase() || '';
                    break;
                case 'type':
                    valueA = a.type?.toLowerCase() || '';
                    valueB = b.type?.toLowerCase() || '';
                    break;
                case 'status':
                    valueA = a.status?.toLowerCase() || '';
                    valueB = b.status?.toLowerCase() || '';
                    break;
                default:
                    valueA = a[orderBy as keyof Junction] || '';
                    valueB = b[orderBy as keyof Junction] || '';
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
        localStorage.setItem(`${localStorageKey}_${STORAGE_KEY_SORT}`, JSON.stringify(sortState));
    }, [sortState, localStorageKey]);

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

    // Persist visible columns on change
    useEffect(() => {
        localStorage.setItem(localStorageKey, JSON.stringify(visibleJunctionCols));
    }, [visibleJunctionCols, localStorageKey]);

    // Popover anchor
    const [anchorJunctionCols, setAnchorJunctionCols] = useState<HTMLElement | null>(null);

    // Memoize event handlers to prevent recreation on each render
    const openJunctionPopover = useCallback((e: MouseEvent<HTMLElement>) => {
        e.stopPropagation(); // Prevent unwanted navigation
        setAnchorJunctionCols(e.currentTarget);
    }, []);

    const closeJunctionPopover = useCallback(() =>
        setAnchorJunctionCols(null),
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
    const handleMoveColumn = useCallback((field: string, direction: "up" | "down") => {
        moveCol(field, visibleJunctionCols, setVisibleJunctionCols, direction);
    }, [visibleJunctionCols]);

    const handleToggleColumn = useCallback((field: string, checked: boolean) => {
        if (checked) {
            setVisibleJunctionCols(prev => [...prev, field]);
        } else {
            setVisibleJunctionCols(prev => prev.filter(f => f !== field));
        }
    }, []);

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

    // Junction creation handlers
    const handleAddJunction = () => {
        // Reset the form when opening
        // Get the highest existing sort order
        const highestSortOrder = junctions.length > 0
            ? Math.max(...junctions.map(j => j.sortOrder !== undefined ? j.sortOrder : 0))
            : -1;

        setNewJunction({
            name: "",
            description: "",
            type: "COM Junction",
            showOnDashboard: true,
            autoStartOnLaunch: false,
            allTargetsAllData: false,
            deviceLinks: [],
            collectorLinks: [],
            sortOrder: highestSortOrder + 1,
            gatewayDestination: "",
            selectedGatewayDeviceId: ""
        });
        setError("");
        setAddJunctionModalOpen(true);
    };

    // Handle the file upload and import
    const handleImportJunction = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            showSnackbar("No file selected", "error");
            return;
        }

        setImporting(true);
        try {
            const fileContent = await file.text();
            const jsonData = JSON.parse(fileContent);

            // Import junction logic would go here - calling the service
            // await junctionService.importJunction(jsonData);

            // Notify parent to refresh
            if (onJunctionAdded) {
                onJunctionAdded();
            }
            showSnackbar("Junction imported successfully", "success");
        } catch (error) {
            console.error("Import failed:", error);
            showSnackbar("Failed to import junction", "error");
        } finally {
            setImporting(false);
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Form handlers for the add junction modal
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setNewJunction({ ...newJunction, [name]: value });
    };

    const handleSelectChange = (e: SelectChangeEvent<string>) => {
        const { name, value } = e.target;

        // Handle gateway device selection
        if (name === "selectedGatewayDeviceId") {
            const selectedDevice = gatewayDevices.find(device => device.id.toString() === value);
            setNewJunction({
                ...newJunction,
                [name]: value,
                gatewayDestination: selectedDevice ? selectedDevice.ipAddress : "" // Use IP address, not MAC
            });
        } else {
            setNewJunction({ ...newJunction, [name]: value });
        }
    };

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setNewJunction({ ...newJunction, [name]: checked });
    };

    const handleSave = async (redirect: boolean) => {
        setLoading(true);
        setError("");

        // Basic validation
        if (!newJunction.name) {
            setError("Junction name is required!");
            setLoading(false);
            return;
        }

        // Validate gateway destination for Gateway types
        if ((newJunction.type === "Gateway Junction (HTTP to ESP:NOW)" ||
            newJunction.type === "Gateway Junction (Websocket to ESP:NOW)") &&
            !newJunction.selectedGatewayDeviceId) {
            setError("Please select a gateway device for Gateway junctions!");
            setLoading(false);
            return;
        }

        try {
            const response = await fetch("/api/junctions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...newJunction, status: "Idle" }),
            });

            if (!response.ok) {
                throw new Error("Failed to create junction");
            }

            const result = await response.json();
            if (result && typeof result.id === 'number') {
                handleJunctionAdded(result.id, redirect);
            } else {
                setError("Failed to get valid junction ID from response");
                setLoading(false);
            }
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    const handleJunctionAdded = async (id: number, redirect: boolean) => {
        // Notify parent to refresh junctions
        if (onJunctionAdded) {
            onJunctionAdded();
        }
        showSnackbar("Junction added successfully", "success");

        if (redirect) {
            navigate(`/configure-junction/${id}`);
        } else {
            setAddJunctionModalOpen(false);
        }
        setLoading(false);
    };

    // Helper function to determine if a gateway device should be shown
    const shouldShowGatewaySelection = () => {
        return newJunction.type === "Gateway Junction (HTTP to ESP:NOW)" ||
            newJunction.type === "Gateway Junction (Websocket to ESP:NOW)";
    };

    return (
        <>
            {/* Table header with Add Junction button and column selector */}
            <Box display="flex" alignItems="center" mb={2}>
                {/* Add Junction button on the far left */}
                {showAddButton && (
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleAddJunction}
                        size="small"
                        startIcon={<AddIcon />}
                        sx={{ mr: 2 }}
                    >
                        Add Junction
                    </Button>
                )}

                {/* Import button next to Add Junction */}
                {showImportButton && junctionImportExportEnabled && (
                    <Button
                        variant="outlined"
                        color="primary"
                        component="label"
                        startIcon={<CloudUploadIcon />}
                        size="small"
                        disabled={importing}
                        sx={{ display: 'flex', alignItems: 'center', mr: 2 }}
                    >
                        {importing ? (
                            <>
                                <CircularProgress size={16} sx={{ mr: 1 }} />
                                Importing...
                            </>
                        ) : (
                            'Import Junction'
                        )}
                        <input
                            type="file"
                            hidden
                            accept=".json"
                            onChange={handleImportJunction}
                            disabled={importing}
                            ref={fileInputRef}
                        />
                    </Button>
                )}

                {/* Right side controls */}
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={detailedConnections}
                                onChange={(e) => setDetailedConnections(e.target.checked)}
                                size="small"
                            />
                        }
                        label={
                            <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                                Show Details
                            </Typography>
                        }
                        sx={{
                            margin: 0,
                            '& .MuiFormControlLabel-label': {
                                fontWeight: 500
                            }
                        }}
                    />

                    <Button
                        onClick={openJunctionPopover}
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
                    open={Boolean(anchorJunctionCols)}
                    anchorEl={anchorJunctionCols}
                    onClose={closeJunctionPopover}
                >
                    <List dense>
                        {/* visible columns first */}
                        {visibleJunctionCols.map((field, idx) => (
                            <ListItem key={field}>
                                <Checkbox
                                    checked
                                    onChange={(e) => {
                                        handleToggleColumn(field, e.target.checked);
                                    }}
                                />
                                <ListItemText primary={junctionCols.find((c) => c.field === field)!.label} />
                                <IconButton
                                    size="small"
                                    disabled={idx === 0}
                                    onClick={() => handleMoveColumn(field, "up")}
                                >
                                    <ArrowUpwardIcon fontSize="inherit" />
                                </IconButton>
                                <IconButton
                                    size="small"
                                    disabled={idx === visibleJunctionCols.length - 1}
                                    onClick={() => handleMoveColumn(field, "down")}
                                >
                                    <ArrowDownwardIcon fontSize="inherit" />
                                </IconButton>
                            </ListItem>
                        ))}
                        {/* then hidden columns */}
                        {junctionCols
                            .filter((c) => !visibleJunctionCols.includes(c.field))
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

            {/* Junctions Table */}
            <TableContainer component={Paper} sx={{ mb: 3 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                            {visibleJunctionCols.map((field) => {
                                const colDef = junctionCols.find((c) => c.field === field)!;
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
                        {sortedJunctions.length > 0 ? (
                            sortedJunctions.map((junction) => (
                                <JunctionTableRow
                                    key={junction.id}
                                    junction={junction}
                                    visibleCols={visibleJunctionCols}
                                    allColumns={junctionCols}
                                    onStartJunction={memoizedStartJunction}
                                    onStopJunction={memoizedStopJunction}
                                    onCloneJunction={memoizedCloneJunction}
                                    onDeleteJunction={memoizedDeleteJunction}
                                    detailedConnections={detailedConnections}
                                    navigate={navigate}
                                    hyperlinkRows={hyperlinkRowsEnabled}
                                    devices={devices}
                                    collectors={collectors}
                                />
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={visibleJunctionCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                    <Typography color="textSecondary">No junctions to display</Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

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

            {/* Add Junction Modal */}
            <Modal open={addJunctionModalOpen} onClose={() => setAddJunctionModalOpen(false)}>
                <Box sx={{
                    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                    width: '80%', maxWidth: 600, bgcolor: 'background.paper', p: 4, boxShadow: 24, borderRadius: 2
                }}>
                    <Typography variant="h6" gutterBottom>Create New Junction</Typography>
                    {loading ? (
                        <Box sx={{ display: "flex", justifyContent: "center" }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : (
                        <>
                            {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}

                            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Junction Name"
                                    name="name"
                                    value={newJunction.name}
                                    onChange={handleChange}
                                    required
                                />

                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Description"
                                    name="description"
                                    value={newJunction.description}
                                    onChange={handleChange}
                                    multiline
                                    rows={2}
                                />

                                <FormControl fullWidth size="small">
                                    <InputLabel id="junction-type-label">Junction Type</InputLabel>
                                    <Select
                                        labelId="junction-type-label"
                                        name="type"
                                        value={newJunction.type as string}
                                        onChange={handleSelectChange}
                                        label="Junction Type"
                                    >
                                        <MenuItem value="COM Junction">COM Junction</MenuItem>
                                        <MenuItem value="HTTP Junction">HTTP Junction</MenuItem>
                                        <MenuItem value="MQTT Junction">MQTT Junction</MenuItem>
                                        <MenuItem value="Websocket Junction">Websocket Junction</MenuItem>
                                        <MenuItem value="Gateway Junction (HTTP to ESP:NOW)">Gateway Junction (HTTP to ESP:NOW)</MenuItem>
                                        <MenuItem value="Gateway Junction (Websocket to ESP:NOW)">Gateway Junction (Websocket to ESP:NOW)</MenuItem>
                                    </Select>
                                </FormControl>

                                {/* Gateway Device Selection - only show for Gateway types */}
                                {shouldShowGatewaySelection() && (
                                    <>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="gateway-device-label">Gateway Device</InputLabel>
                                            <Select
                                                labelId="gateway-device-label"
                                                name="selectedGatewayDeviceId"
                                                value={newJunction.selectedGatewayDeviceId || ""}
                                                onChange={handleSelectChange}
                                                label="Gateway Device"
                                                required
                                            >
                                                {gatewayDevices.length === 0 ? (
                                                    <MenuItem disabled>
                                                        No gateway devices found
                                                    </MenuItem>
                                                ) : (
                                                    gatewayDevices.map((device) => (
                                                        <MenuItem key={device.id} value={device.id.toString()}>
                                                            {device.name} ({device.ipAddress})
                                                        </MenuItem>
                                                    ))
                                                )}
                                            </Select>
                                        </FormControl>

                                        {/* Show the IP address that will be used */}
                                        {newJunction.gatewayDestination && (
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Gateway IP Address"
                                                value={newJunction.gatewayDestination}
                                                disabled
                                                helperText="IP address of the selected gateway device"
                                            />
                                        )}
                                    </>
                                )}

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={newJunction.showOnDashboard || false}
                                                onChange={handleCheckboxChange}
                                                name="showOnDashboard"
                                                size="small"
                                            />
                                        }
                                        label="Show on Dashboard"
                                    />

                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={newJunction.autoStartOnLaunch || false}
                                                onChange={handleCheckboxChange}
                                                name="autoStartOnLaunch"
                                                size="small"
                                            />
                                        }
                                        label="Auto Start on Launch"
                                    />

                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={newJunction.allTargetsAllData || false}
                                                onChange={handleCheckboxChange}
                                                name="allTargetsAllData"
                                                size="small"
                                            />
                                        }
                                        label="All Targets All Data"
                                    />
                                </Box>
                            </Box>

                            <Box sx={{ display: "flex", gap: 2, marginTop: 3, justifyContent: "flex-end" }}>
                                <Button
                                    variant="contained"
                                    onClick={() => handleSave(false)}
                                    size="small"
                                >
                                    Save
                                </Button>

                                <Button
                                    variant="contained"
                                    color="secondary"
                                    onClick={() => handleSave(true)}
                                    size="small"
                                >
                                    Save & Configure
                                </Button>

                                <Button
                                    variant="outlined"
                                    onClick={() => setAddJunctionModalOpen(false)}
                                    size="small"
                                >
                                    Cancel
                                </Button>
                            </Box>
                        </>
                    )}
                </Box>
            </Modal>
        </>
    );
};

export default JunctionsTable;