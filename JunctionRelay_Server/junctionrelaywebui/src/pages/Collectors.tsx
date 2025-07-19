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
    Modal,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
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
import CloudIcon from '@mui/icons-material/Cloud';
import DnsIcon from '@mui/icons-material/Dns';
import HomeIcon from '@mui/icons-material/Home';
import ComputerIcon from '@mui/icons-material/Computer';
import MemoryIcon from '@mui/icons-material/Memory';
import RouterIcon from '@mui/icons-material/Router';
import ColorLensIcon from '@mui/icons-material/ColorLens';
import SpeedIcon from '@mui/icons-material/Speed';
import PaymentIcon from '@mui/icons-material/Payment';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import MinimizeIcon from '@mui/icons-material/Minimize';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SetupInstructions_Collectors from '../components/SetupInstructions_Collectors';
import { useTheme, useMediaQuery } from "@mui/material";

// Types
type ViewMode = 'table' | 'standard' | 'mini';
type SortDirection = 'asc' | 'desc';

interface CollectorColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    sortable?: boolean;
}

// Storage keys
const STORAGE_KEY_COLLECTORS_COLUMNS = "collectors_visible_columns";
const STORAGE_KEY_COLLECTORS_SORT = "collectors_sort_state";
const STORAGE_KEY_COLLECTORS_VIEW_MODE = "junctionrelay_collectors_view_mode";

// Column definitions
const defaultCollectorColumns: CollectorColumn[] = [
    { field: "actions", label: "Actions", align: "right", sortable: false },
    { field: "name", label: "Collector Name", align: "left", sortable: true },
    { field: "type", label: "Type", align: "left", sortable: true },
    { field: "url", label: "URL", align: "left", sortable: true },
    { field: "accessToken", label: "Access Token", align: "left", sortable: false },
    { field: "status", label: "Status", align: "left", sortable: true },
];

// Default visible columns
const defaultVisibleColumns = ["name", "type", "url", "accessToken", "status", "actions"];

// Helper function to get collector type info with colors and icons
const getCollectorTypeInfo = (type: string) => {
    const typeMap: Record<string, { color: "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error", icon: React.ReactNode }> = {
        "Cloudflare": { color: "primary", icon: <CloudIcon fontSize="small" /> },
        "Github": { color: "info", icon: <DnsIcon fontSize="small" /> },
        "HomeAssistant": { color: "info", icon: <HomeIcon fontSize="small" /> },
        "Host": { color: "secondary", icon: <ComputerIcon fontSize="small" /> },
        "LibreHardwareMonitor": { color: "primary", icon: <MemoryIcon fontSize="small" /> },
        "MQTT": { color: "error", icon: <RouterIcon fontSize="small" /> },
        "NeoPixelColor": { color: "secondary", icon: <ColorLensIcon fontSize="small" /> },
        "RateTester": { color: "warning", icon: <SpeedIcon fontSize="small" /> },
        "Render": { color: "success", icon: <CloudIcon fontSize="small" /> },
        "Stripe": { color: "success", icon: <PaymentIcon fontSize="small" /> },
        "UptimeKuma": { color: "success", icon: <MonitorHeartIcon fontSize="small" /> },
    };

    return typeMap[type] || { color: "default" as const, icon: <DnsIcon fontSize="small" /> };
};

// Memoized Collector Card component for tile views
const CollectorCard = memo(({
    collector,
    viewMode,
    onDelete,
    onEdit,
}: {
    collector: any,
    viewMode: 'standard' | 'mini',
    onDelete: (e: React.MouseEvent, id: number) => void,
    onEdit: (e: React.MouseEvent, collector: any) => void,
}) => {
    const navigate = useNavigate();
    const typeInfo = getCollectorTypeInfo(collector.collectorType);

    const getCardHeight = () => {
        return viewMode === 'mini' ? 120 : 220;
    };

    const statusColor = collector.status === 'Active' ? 'success' :
        collector.status === 'Inactive' ? 'error' : 'default';

    return (
        <Card
            variant="outlined"
            sx={{
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                position: 'relative',
                minHeight: getCardHeight(),
                display: 'flex',
                flexDirection: 'column',
                '&:hover': {
                    boxShadow: 6,
                    transform: 'translateY(-2px)',
                    backgroundColor: 'action.hover'
                },
                border: '1px solid',
                borderColor: statusColor === 'success' ? 'success.main' : 'divider',
            }}
            onClick={() => navigate(`/configure-collector/${collector.id}`)}
        >
            {/* Status Badge */}
            <Box
                sx={{
                    position: 'absolute',
                    top: viewMode === 'mini' ? 4 : 8,
                    right: viewMode === 'mini' ? 4 : 8,
                    backgroundColor: statusColor === 'success' ? 'success.main' :
                        statusColor === 'error' ? 'error.main' : 'grey.400',
                    color: statusColor === 'success' ? 'success.contrastText' :
                        statusColor === 'error' ? 'error.contrastText' : 'grey.700',
                    px: viewMode === 'mini' ? 0.5 : 1.5,
                    py: viewMode === 'mini' ? 0.25 : 0.5,
                    borderRadius: viewMode === 'mini' ? 1 : 2,
                    fontSize: viewMode === 'mini' ? '0.6rem' : '0.75rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    boxShadow: 1,
                    zIndex: 1
                }}
            >
                {viewMode === 'mini'
                    ? (statusColor === 'success' ? '●' : '○')
                    : (collector.status || 'Unknown')
                }
            </Box>

            <CardContent sx={{
                flex: 1,
                pt: viewMode === 'mini' ? 2.5 : 5,
                p: viewMode === 'mini' ? 1 : 2
            }}>
                {/* Collector Name with type icon */}
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: viewMode === 'mini' ? 0.5 : 1,
                    gap: 0.5
                }}>
                    {typeInfo.icon}
                    <Typography
                        variant={viewMode === 'mini' ? 'body2' : 'h6'}
                        sx={{
                            fontSize: viewMode === 'mini' ? '0.75rem' : { xs: '1rem', sm: '1.1rem' },
                            fontWeight: 600,
                            lineHeight: viewMode === 'mini' ? 1.2 : 1.5,
                            flex: 1
                        }}
                        noWrap
                    >
                        {collector.name}
                    </Typography>
                </Box>

                {/* Collector Details */}
                {viewMode === 'standard' && (
                    <>
                        <Divider sx={{ mb: 1 }} />
                        <Box sx={{ mb: 1 }}>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Type:</strong> {collector.collectorType || "Unknown"}
                            </Typography>
                            {collector.url && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>URL:</strong> {collector.url}
                                </Typography>
                            )}
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Token:</strong> {collector.accessToken ? "Configured" : "Not set"}
                            </Typography>
                        </Box>
                    </>
                )}

                {/* Type Chip */}
                <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: viewMode === 'mini' ? 0.5 : 1,
                    mt: 'auto'
                }}>
                    <Box sx={{
                        display: 'flex',
                        gap: 0.5,
                        flexWrap: 'wrap',
                        alignItems: 'center'
                    }}>
                        <Chip
                            label={viewMode === 'mini'
                                ? collector.collectorType?.substring(0, 8) + (collector.collectorType?.length > 8 ? '...' : '')
                                : collector.collectorType
                            }
                            color={typeInfo.color}
                            size="small"
                            sx={{
                                fontSize: viewMode === 'mini' ? '0.6rem' : '0.7rem',
                                height: viewMode === 'mini' ? 18 : 22
                            }}
                        />
                    </Box>
                </Box>

                {/* Action Buttons for standard view */}
                {viewMode === 'standard' && (
                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        mt: 1,
                        gap: 1
                    }}>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(e, collector);
                                }}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(e, collector.id);
                                }}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                )}
            </CardContent>
        </Card>
    );
});

// Memoized TableRow component
const CollectorTableRow = memo(({
    collector,
    visibleCols,
    allColumns,
    onDelete,
    onEdit,
}: {
    collector: any,
    visibleCols: string[],
    allColumns: CollectorColumn[],
    onDelete: (e: React.MouseEvent, id: number) => void,
    onEdit: (e: React.MouseEvent, collector: any) => void,
}) => {
    const navigate = useNavigate();

    const getCollectorCell = useCallback((field: string) => {
        switch (field) {
            case "name":
                const typeInfo = getCollectorTypeInfo(collector.collectorType);
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {typeInfo.icon}
                        <Typography fontWeight="medium" color="text.primary">
                            {collector.name}
                        </Typography>
                    </Box>
                );
            case "type":
                const typeInfoChip = getCollectorTypeInfo(collector.collectorType);
                return (
                    <Chip
                        label={collector.collectorType}
                        color={typeInfoChip.color}
                        size="small"
                        sx={{ fontSize: '0.75rem', height: 22 }}
                    />
                );
            case "url":
                return collector.url || "—";
            case "accessToken":
                return collector.accessToken ? "********" : "Not set";
            case "status":
                const statusColor = collector.status === 'Active' ? 'success' :
                    collector.status === 'Inactive' ? 'error' : 'default';
                return (
                    <Chip
                        label={collector.status || 'Unknown'}
                        color={statusColor}
                        size="small"
                    />
                );
            case "actions":
                return (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={(e) => onEdit(e, collector)}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                onClick={(e) => onDelete(e, collector.id)}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            default:
                return collector[field] || "—";
        }
    }, [collector, onDelete, onEdit]);

    return (
        <TableRow
            hover
            onClick={() => navigate(`/configure-collector/${collector.id}`)}
            sx={{ cursor: "pointer" }}
        >
            {visibleCols.map((field) => {
                const colDef = allColumns.find((c) => c.field === field)!;

                const getColumnWidth = (field: string) => {
                    switch (field) {
                        case "name":
                            return { minWidth: 200, width: 'auto' };
                        case "type":
                            return { minWidth: 120, width: 120 };
                        case "url":
                            return { minWidth: 200, width: 'auto' };
                        case "accessToken":
                            return { minWidth: 120, width: 120 };
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
                        sx={{
                            ...columnWidth,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            padding: '8px 16px'
                        }}
                    >
                        {getCollectorCell(field)}
                    </TableCell>
                );
            })}
        </TableRow>
    );
});

// AddCollector Modal Component
const AddCollectorModal: React.FC<{
    open: boolean,
    onClose: () => void,
    onCollectorAdded: () => void,
    onCollectorAddedAndConfigure: (collectorId: number) => void
}> = ({ open, onClose, onCollectorAdded, onCollectorAddedAndConfigure }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);
    const [setupInstructionsMinimized, setSetupInstructionsMinimized] = useState<boolean>(false);
    const [collector, setCollector] = useState<any>({
        name: "",
        url: "",
        accessToken: "",
        collectorType: "",
        serviceId: "",
        externalAccessToken: false
    });
    const [encryptionPassword, setEncryptionPassword] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [services, setServices] = useState<any[]>([]);

    // Collector type options for dropdown
    const collectorTypes = [
        { value: "", name: "Select Collector Type", desc: "Choose a collector type to begin" },
        { value: "Cloudflare", name: "Cloudflare", desc: "CDN & DNS analytics" },
        { value: "Github", name: "GitHub Repository", desc: "Repository statistics" },
        { value: "HomeAssistant", name: "Home Assistant", desc: "Smart home automation" },
        { value: "Host", name: "Host Device", desc: "System monitoring" },
        { value: "LibreHardwareMonitor", name: "Libre Hardware Monitor", desc: "Hardware sensors" },
        { value: "MQTT", name: "MQTT Service", desc: "Message broker data" },
        { value: "NeoPixelColor", name: "NeoPixel Color", desc: "LED strip monitoring" },
        { value: "RateTester", name: "Rate Tester", desc: "Performance testing" },
        { value: "Render", name: "Render", desc: "Cloud platform metrics" },
        { value: "Stripe", name: "Stripe", desc: "Payment processing" },
        { value: "UptimeKuma", name: "Uptime Kuma", desc: "Service monitoring" }
    ];

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            // Reset to initial state when modal opens
            setCollector({
                name: "",
                url: "",
                accessToken: "",
                collectorType: "",
                serviceId: "",
                externalAccessToken: false
            });
            setEncryptionPassword("");
            setError("");
            setServices([]);
        }
    }, [open]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<any>) => {
        const { name, value } = e.target;
        setCollector({ ...collector, [name]: value });
    };

    // Handle form submission
    const handleAddCollector = async (configureAfter: boolean = false) => {
        setLoading(true);
        setError("");
        setConfigureAfterAdd(configureAfter);

        // Basic validation
        if (!collector.name || !collector.collectorType) {
            setError("Name and Type are required!");
            setLoading(false);
            return;
        }

        if (
            (collector.collectorType === "Cloudflare" ||
                collector.collectorType === "Github" ||
                collector.collectorType === "HomeAssistant" ||
                collector.collectorType === "LibreHardwareMonitor" ||
                collector.collectorType === "Render" ||
                collector.collectorType === "Stripe" ||
                collector.collectorType === "UptimeKuma") &&
            !collector.url
        ) {
            setError("URL is required for this collector type.");
            setLoading(false);
            return;
        }

        if ((collector.collectorType === "Cloudflare" || collector.collectorType === "Github" || collector.collectorType === "HomeAssistant" || collector.collectorType === "Render" || collector.collectorType === "Stripe") && !collector.accessToken) {
            setError("Access Token is required for this collector type.");
            setLoading(false);
            return;
        }

        // URL pattern only applies if a URL is required and present
        const urlPattern = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
        if (
            (collector.collectorType === "Cloudflare" ||
                collector.collectorType === "Github" ||
                collector.collectorType === "HomeAssistant" ||
                collector.collectorType === "LibreHardwareMonitor" ||
                collector.collectorType === "Render" ||
                collector.collectorType === "Stripe" ||
                collector.collectorType === "UptimeKuma") &&
            collector.url &&
            !urlPattern.test(collector.url)
        ) {
            setError("Please enter a valid URL.");
            setLoading(false);
            return;
        }

        if (collector.collectorType === "MQTT" && !collector.serviceId) {
            setError("Service ID is required for MQTT collectors.");
            setLoading(false);
            return;
        }

        // Validate encryption password if external encryption is selected
        if (collector.externalAccessToken && !encryptionPassword.trim()) {
            setError("Encryption password is required when using external password encryption.");
            setLoading(false);
            return;
        }

        // Ensure serviceId is null for non-MQTT collectors
        if (collector.collectorType !== "MQTT") {
            collector.serviceId = null;  // Set to null if not MQTT
        }

        // Send the request
        try {
            const requestBody = {
                ...collector,
                status: "Active"
            };

            // If using external encryption, include the encryption password in a way the backend expects
            // (You may need to adjust this based on your backend implementation)
            if (collector.externalAccessToken && encryptionPassword) {
                // The backend will need to handle this appropriately
                requestBody.encryptionPassword = encryptionPassword;
            }

            const response = await fetch("/api/collectors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            // First check if the response is ok
            if (response.ok) {
                const result = await response.json();
                // If we want to configure after adding, use the new callback
                if (configureAfter && result && result.id) {
                    onCollectorAddedAndConfigure(result.id);
                } else {
                    onCollectorAdded(); // Otherwise just refresh the collectors list
                }
                onClose(); // Close the modal in both cases
                return;
            }

            // If we get a 500 Internal Server Error and it's likely a unique constraint violation
            if (response.status === 500) {
                // For Internal Server Error, we'll assume it's likely a duplicate collector name
                setError("A collector with this name already exists. Collector names must be unique.");
                setLoading(false);
                return;
            }

            // For other status codes, try to parse the response
            let errorMessage = "Error adding collector";
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (parseError) {
                // If response is not valid JSON, use the status text
                errorMessage = response.statusText || errorMessage;

                // Try to get the response text if JSON parsing failed
                try {
                    const responseText = await response.text();
                    console.log("Error response text:", responseText);

                    // Check for specific text patterns that might indicate a unique constraint violation
                    if (
                        responseText.includes("unique") ||
                        responseText.includes("duplicate") ||
                        responseText.toLowerCase().includes("already exists") ||
                        responseText.includes("constraint")
                    ) {
                        errorMessage = "A collector with this name already exists. Collector names must be unique.";
                    }
                } catch (textError) {
                    // If all else fails, use our friendly default error
                    console.error("Error getting response text:", textError);
                }
            }

            throw new Error(errorMessage);
        } catch (err: any) {
            // If the error message contains any indication of a unique constraint
            if (
                err.message.includes("unique") ||
                err.message.includes("duplicate") ||
                err.message.toLowerCase().includes("already exists") ||
                err.message.includes("constraint") ||
                err.message.includes("Internal Server Error")
            ) {
                setError("A collector with this name already exists. Collector names must be unique.");
            } else {
                setError(err.message);
            }
            console.error("Error adding collector:", err);
        } finally {
            setLoading(false);
        }
    };

    // Fetch services for the picklist when MQTT is selected
    const fetchServices = async () => {
        try {
            const servicesResponse = await fetch(`/api/services`); // Assuming the endpoint to fetch services
            if (!servicesResponse.ok) {
                throw new Error("Failed to fetch services");
            }
            const servicesData = await servicesResponse.json();
            setServices(servicesData); // Set the services to the state
        } catch (err) {
            setError("Error fetching services.");
            console.error(err);
        }
    };

    // Set default URL based on selected collector type
    useEffect(() => {
        if (collector.collectorType === "MQTT") {
            fetchServices(); // Fetch services when MQTT is selected
        }

        if (collector.collectorType === "Cloudflare") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Cloudflare",
                url: "https://dash.cloudflare.com/account_id/zone_id",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 60000,
            }));
        } else if (collector.collectorType === "Github") {
            setCollector((prev: any) => ({
                ...prev,
                name: "GitHub Repository",
                url: "https://github.com/owner/repo",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 60000,
            }));
        } else if (collector.collectorType === "HomeAssistant") {
            setCollector((prev: any) => ({
                ...prev,
                name: "HomeAssistant",
                url: "http://10.168.1.17:8123",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 5000,
            }));
        } else if (collector.collectorType === "Host") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Host Device",
                url: "localhost",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 1000,
            }));
        } else if (collector.collectorType === "LibreHardwareMonitor") {
            setCollector((prev: any) => ({
                ...prev,
                name: "LibreHardwareMonitor",
                url: "http://localhost:8085",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 1000,
            }));
        } else if (collector.collectorType === "NeoPixelColor") {
            setCollector((prev: any) => ({
                ...prev,
                name: "NeoPixel Color",
                url: "",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 3000,
            }));
        } else if (collector.collectorType === "RateTester") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Rate Tester",
                url: "",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 1000,
                sendRate: 1000
            }));
        } else if (collector.collectorType === "Render") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Render Service",
                url: "https://dashboard.render.com/web/srv-abc123def456",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 60000,
            }));
        } else if (collector.collectorType === "Stripe") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Stripe",
                url: "https://api.stripe.com",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 60000,
            }));
        } else if (collector.collectorType === "UptimeKuma") {
            setCollector((prev: any) => ({
                ...prev,
                name: "Uptime Kuma",
                url: "http://localhost:3001/metrics",
                accessToken: "",
                externalAccessToken: false,
                pollRate: 3000,
            }));
        } else {
            setCollector((prev: any) => ({
                ...prev,
                name: "",
                url: "",
                accessToken: "",
                externalAccessToken: false
            }));
        }

        // Reset encryption password when collector type changes
        setEncryptionPassword("");
    }, [collector.collectorType]);

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: { xs: 'auto', sm: '90%', md: '80%' },
                maxWidth: { xs: '95vw', md: 900 },
                minWidth: { xs: 320, sm: 400 },
                height: 'auto',
                maxHeight: { xs: '90vh', md: '80vh' },
                bgcolor: 'background.paper',
                p: 0,
                boxShadow: 24,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <Typography variant="h6" sx={{
                    p: { xs: 2, md: 3 },
                    pb: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    fontSize: { xs: '1.1rem', md: '1.25rem' }
                }}>
                    Add Collector
                </Typography>

                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
                        <CircularProgress size={40} />
                    </Box>
                ) : (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', md: 'row' },
                        flex: 1,
                        overflow: 'hidden',
                        minHeight: 0
                    }}>
                        {/* Left side - Collector types list (Desktop only) */}
                        <Box sx={{
                            width: { md: 280 },
                            borderRight: { md: '1px solid' },
                            borderColor: 'divider',
                            overflowY: 'auto',
                            bgcolor: 'action.hover',
                            display: { xs: 'none', md: 'block' }
                        }}>
                            <Typography variant="subtitle2" sx={{ p: 2, pb: 1, fontWeight: 'bold', color: 'text.secondary' }}>
                                Select Collector Type
                            </Typography>
                            {collectorTypes.slice(1).map((collectorType) => (
                                <Box
                                    key={collectorType.value}
                                    onClick={() => setCollector({ ...collector, collectorType: collectorType.value })}
                                    sx={{
                                        p: 2,
                                        mx: 1,
                                        mb: 1,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        bgcolor: collector.collectorType === collectorType.value ? 'primary.main' : 'transparent',
                                        color: collector.collectorType === collectorType.value ? 'primary.contrastText' : 'text.primary',
                                        '&:hover': {
                                            bgcolor: collector.collectorType === collectorType.value ? 'primary.dark' : 'action.hover'
                                        },
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={collector.collectorType === collectorType.value ? 'bold' : 'medium'}>
                                        {collectorType.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        opacity: collector.collectorType === collectorType.value ? 0.9 : 0.7,
                                        display: 'block'
                                    }}>
                                        {collectorType.desc}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>

                        {/* Configuration form */}
                        <Box sx={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            order: { xs: 1, md: 2 }
                        }}>
                            <Box sx={{
                                p: { xs: 2, md: 3 },
                                overflowY: 'auto',
                                flex: 1
                            }}>
                                {error && (
                                    <Alert severity="error" sx={{ mb: 2 }}>
                                        {error}
                                    </Alert>
                                )}

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {/* Collector Type Dropdown - Mobile only */}
                                    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="collector-type-label">Collector Type *</InputLabel>
                                            <Select
                                                labelId="collector-type-label"
                                                value={collector.collectorType}
                                                onChange={handleChange}
                                                name="collectorType"
                                                required
                                                label="Collector Type *"
                                            >
                                                {collectorTypes.map((type) => (
                                                    <MenuItem key={type.value} value={type.value} disabled={type.value === ""}>
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="medium">
                                                                {type.name}
                                                            </Typography>
                                                            {type.value !== "" && (
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {type.desc}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>

                                    {/* Only show form fields if collector type is selected */}
                                    {collector.collectorType && (
                                        <>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Collector Name"
                                                name="name"
                                                value={collector.name}
                                                onChange={handleChange}
                                                required
                                                error={!!error && error.includes("name")}
                                                helperText={error && error.includes("name") ? "Name must be unique" : ""}
                                            />

                                            {/* URL field for collectors that need it */}
                                            {(collector.collectorType === "Cloudflare" ||
                                                collector.collectorType === "Github" ||
                                                collector.collectorType === "HomeAssistant" ||
                                                collector.collectorType === "LibreHardwareMonitor" ||
                                                collector.collectorType === "Render" ||
                                                collector.collectorType === "Stripe" ||
                                                collector.collectorType === "UptimeKuma") && (
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label={
                                                            collector.collectorType === "Github" ? "GitHub Repository URL" :
                                                                collector.collectorType === "Cloudflare" ? "Cloudflare Zone URL" :
                                                                    collector.collectorType === "Render" ? "Render Service URL" :
                                                                        collector.collectorType === "Stripe" ? "Stripe API Base URL" :
                                                                            "URL"
                                                        }
                                                        name="url"
                                                        value={collector.url}
                                                        onChange={handleChange}
                                                        required
                                                        placeholder={
                                                            collector.collectorType === "Github" ? "https://github.com/owner/repo" :
                                                                collector.collectorType === "Cloudflare" ? "https://dash.cloudflare.com/account_id/zone_id" :
                                                                    collector.collectorType === "Render" ? "https://dashboard.render.com/web/srv-abc123" :
                                                                        collector.collectorType === "Stripe" ? "https://api.stripe.com" :
                                                                            ""
                                                        }
                                                    />
                                                )}

                                            {/* Access Token for collectors that need it */}
                                            {(collector.collectorType === "Cloudflare" ||
                                                collector.collectorType === "Github" ||
                                                collector.collectorType === "HomeAssistant" ||
                                                collector.collectorType === "Render" ||
                                                collector.collectorType === "Stripe") && (
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label={
                                                            collector.collectorType === "Github" ? "GitHub Personal Access Token" :
                                                                collector.collectorType === "Cloudflare" ? "Cloudflare API Token" :
                                                                    collector.collectorType === "Render" ? "Render API Key" :
                                                                        collector.collectorType === "Stripe" ? "Stripe Secret Key" :
                                                                            "Access Token"
                                                        }
                                                        name="accessToken"
                                                        value={collector.accessToken}
                                                        onChange={handleChange}
                                                        required
                                                        type="password"
                                                        placeholder={
                                                            collector.collectorType === "Github" ? "ghp_..." :
                                                                collector.collectorType === "Cloudflare" ? "cf_api_token..." :
                                                                    collector.collectorType === "Render" ? "rnd_..." :
                                                                        collector.collectorType === "Stripe" ? "sk_..." :
                                                                            ""
                                                        }
                                                    />
                                                )}

                                            {/* MQTT Service Dropdown */}
                                            {collector.collectorType === "MQTT" && (
                                                <FormControl fullWidth size="small">
                                                    <InputLabel id="service-select-label">Select Service</InputLabel>
                                                    <Select
                                                        labelId="service-select-label"
                                                        value={collector.serviceId}
                                                        onChange={handleChange}
                                                        name="serviceId"
                                                        required
                                                        label="Select Service"
                                                    >
                                                        {services.length > 0 ? (
                                                            services.map((service: any) => (
                                                                <MenuItem key={service.id} value={service.id}>
                                                                    {service.name}
                                                                </MenuItem>
                                                            ))
                                                        ) : (
                                                            <MenuItem disabled>No services available</MenuItem>
                                                        )}
                                                    </Select>
                                                </FormControl>
                                            )}
                                        </>
                                    )}
                                </Box>

                                {/* Security Options Section - Only show for collectors that require access tokens */}
                                {collector.collectorType && (
                                    collector.collectorType === "Cloudflare" ||
                                    collector.collectorType === "Github" ||
                                    collector.collectorType === "HomeAssistant" ||
                                    collector.collectorType === "Render" ||
                                    collector.collectorType === "Stripe"
                                ) && (
                                        <Box sx={{ mt: 3 }}>
                                            <Divider sx={{ mb: 2 }} />
                                            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                                                Access Token Security
                                            </Typography>

                                            <FormControl component="fieldset">
                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                        <input
                                                            type="radio"
                                                            id="local-encryption"
                                                            name="encryption-method"
                                                            checked={!collector.externalAccessToken}
                                                            onChange={() => setCollector({ ...collector, externalAccessToken: false })}
                                                            style={{ marginRight: '8px' }}
                                                        />
                                                        <label htmlFor="local-encryption" style={{ cursor: 'pointer' }}>
                                                            <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                                Save to local DB (Default)
                                                            </Typography>
                                                        </label>
                                                    </Box>

                                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                        <input
                                                            type="radio"
                                                            id="external-encryption"
                                                            name="encryption-method"
                                                            checked={collector.externalAccessToken}
                                                            onChange={() => setCollector({ ...collector, externalAccessToken: true })}
                                                            style={{ marginRight: '8px' }}
                                                        />
                                                        <label htmlFor="external-encryption" style={{ cursor: 'pointer' }}>
                                                            <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                                Encrypt with external password
                                                            </Typography>
                                                        </label>
                                                    </Box>
                                                </Box>
                                            </FormControl>

                                            {/* Encryption Password field - only show if external encryption is selected */}
                                            {collector.externalAccessToken && (
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    label="Encryption Password"
                                                    type="password"
                                                    value={encryptionPassword}
                                                    onChange={(e) => setEncryptionPassword(e.target.value)}
                                                    required
                                                    sx={{ mt: 2 }}
                                                    placeholder="Enter a strong password for encryption"
                                                    helperText="This password will be required each time the application starts"
                                                />
                                            )}

                                            {/* Help text - Hide on mobile */}
                                            <Box sx={{
                                                mt: 2,
                                                p: 2,
                                                bgcolor: 'action.hover',
                                                borderRadius: 1,
                                                display: { xs: 'none', md: 'block' }
                                            }}>
                                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                                    <strong>Local DB:</strong> AccessToken will be encrypted but the encryption keys exist in the application directory.
                                                    This is usually sufficient if you have secured your local network/docker environment and if the AccessToken is not high value.
                                                    The application will decrypt automatically on app start so you do not need to re-enter the token.
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>External Password:</strong> AccessToken will be encrypted using a password that is not saved in the DB -
                                                    this provides maximum security for your AccessToken, but means you must enter the password on application start
                                                    for each collector that is encrypted via this method before it can be used. If you lose your password,
                                                    you will not be able to recover the collector and you will need to recreate it.
                                                </Typography>
                                            </Box>
                                        </Box>
                                    )}
                            </Box>

                            {/* Instructions - responsive height - Hide on mobile */}
                            {collector.collectorType && (
                                <Box sx={{
                                    display: { xs: 'none', md: 'block' },
                                    borderTop: '1px solid',
                                    borderColor: 'divider'
                                }}>
                                    {/* Always Visible Header */}
                                    <Box sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        p: 2,
                                        bgcolor: 'action.hover',
                                        cursor: 'pointer',
                                        '&:hover': {
                                            bgcolor: 'action.selected'
                                        }
                                    }}
                                        onClick={() => setSetupInstructionsMinimized(!setupInstructionsMinimized)}
                                    >
                                        <Typography variant="h6" sx={{ fontSize: '1.1rem', fontWeight: 600 }}>
                                            Setup Instructions
                                        </Typography>
                                        <IconButton size="small" sx={{ p: 0 }}>
                                            {setupInstructionsMinimized ? <ExpandMoreIcon /> : <MinimizeIcon />}
                                        </IconButton>
                                    </Box>

                                    {/* Collapsible Content */}
                                    {!setupInstructionsMinimized && (
                                        <Box sx={{
                                            maxHeight: '300px',
                                            p: 3,
                                            overflowY: 'auto',
                                            bgcolor: 'background.default'
                                        }}>
                                            <SetupInstructions_Collectors collectorType={collector.collectorType} />
                                        </Box>
                                    )}
                                </Box>
                            )}

                            {/* Action buttons - responsive layout */}
                            <Box sx={{
                                p: { xs: 2, md: 3 },
                                borderTop: '1px solid',
                                borderColor: 'divider',
                                display: "flex",
                                flexDirection: { xs: 'column', sm: 'row' },
                                gap: { xs: 1, sm: 2 },
                                flexShrink: 0
                            }}>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddCollector(false)}
                                    size="small"
                                    startIcon={<AddIcon />}
                                    disabled={loading || !collector.collectorType}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {loading && !configureAfterAdd ? "Adding..." : "Add Collector"}
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddCollector(true)}
                                    size="small"
                                    color="secondary"
                                    startIcon={<EditIcon />}
                                    disabled={loading || !collector.collectorType}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {loading && configureAfterAdd ? "Adding..." : "Add & Configure"}
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={onClose}
                                    size="small"
                                    disabled={loading}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    Cancel
                                </Button>
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>
        </Modal>
    );
};

// Main Collectors Component
const Collectors = () => {
    const [collectors, setCollectors] = useState<any[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [addCollectorModalOpen, setAddCollectorModalOpen] = useState(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    // View mode and table management state
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_COLLECTORS_VIEW_MODE);
        return (stored as ViewMode) || 'table';
    });

    const [visibleCols, setVisibleCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_COLLECTORS_COLUMNS);
        return stored ? JSON.parse(stored) : defaultVisibleColumns;
    });

    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_COLLECTORS_SORT);
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
        localStorage.setItem(STORAGE_KEY_COLLECTORS_VIEW_MODE, viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_COLLECTORS_COLUMNS, JSON.stringify(visibleCols));
    }, [visibleCols]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_COLLECTORS_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Show snackbar with configurable severity
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

    const fetchCollectors = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/collectors");
            if (!response.ok) {
                throw new Error("Failed to fetch collectors");
            }
            const data = await response.json();
            setCollectors(data);
        } catch (err: any) {
            showSnackbar("Error fetching collectors", "error");
            console.error("Error fetching collectors:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCollectors();
    }, []);

    // Listen for view mode changes from bottom action bar (mobile only) 
    useEffect(() => {
        const handleBottomActionViewModeChange = (e: CustomEvent) => {
            // Only respond to bottom action bar changes when in mobile mode
            if (isMobile && e.detail.mode) {
                const newMode = e.detail.mode as ViewMode;
                setViewMode(newMode);
                localStorage.setItem(STORAGE_KEY_COLLECTORS_VIEW_MODE, newMode);
            }
        };

        // Listen for localStorage changes from other tabs/windows
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY_COLLECTORS_VIEW_MODE && e.newValue) {
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
        const handleAddCollector = () => {
            console.log('Bottom bar: Add collector requested');
            setAddCollectorModalOpen(true);
        };

        // Add event listener for bottom action bar
        window.addEventListener('bottom-action-add-collector', handleAddCollector);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-add-collector', handleAddCollector);
        };
    }, []);

    // Sort collectors
    const sortedCollectors = useMemo(() => {
        const { orderBy, order } = sortState;
        return [...collectors].sort((a, b) => {
            let valueA: any;
            let valueB: any;

            switch (orderBy) {
                case 'name':
                    valueA = a.name?.toLowerCase() || '';
                    valueB = b.name?.toLowerCase() || '';
                    break;
                case 'type':
                    valueA = a.collectorType?.toLowerCase() || '';
                    valueB = b.collectorType?.toLowerCase() || '';
                    break;
                case 'url':
                    valueA = a.url?.toLowerCase() || '';
                    valueB = b.url?.toLowerCase() || '';
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
    }, [collectors, sortState]);

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
    const handleAddCollector = () => {
        setAddCollectorModalOpen(true);
    };

    const handleCollectorAdded = () => {
        fetchCollectors();
        showSnackbar("Collector added successfully", "success");
    };

    const handleCollectorAddedAndConfigure = (collectorId: number) => {
        showSnackbar("Collector added successfully. Redirecting to configuration...", "success");
        navigate(`/configure-collector/${collectorId}`);
    };

    const handleDelete = async (e: React.MouseEvent, collectorId: number) => {
        e.stopPropagation();
        if (window.confirm("Are you sure you want to delete this collector?")) {
            try {
                const response = await fetch(`/api/collectors/${collectorId}`, {
                    method: "DELETE"
                });

                if (response.ok) {
                    showSnackbar("Collector deleted successfully", "success");
                    fetchCollectors();
                } else {
                    throw new Error("Failed to delete collector");
                }
            } catch (err: unknown) {
                showSnackbar("Error deleting collector", "error");
            }
        }
    };

    const handleEdit = (e: React.MouseEvent, collector: any) => {
        e.stopPropagation();
        navigate(`/configure-collector/${collector.id}`);
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
                    Collector Management
                </Typography>
            )}

            {/* Management Buttons - Hide on mobile since bottom action bar handles it */}
            {!isMobile && (
                <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleAddCollector}
                        size="small"
                        startIcon={<AddIcon />}
                    >
                        Add Collector
                    </Button>
                </Box>
            )}

            {/* Table header with view mode toggle and column selector */}
            <Box display="flex" alignItems="center" mb={1} flexWrap="wrap" gap={2}>
                <Typography variant="h6">Collectors</Typography>

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
                                <ListItemText primary={defaultCollectorColumns.find((c) => c.field === field)!.label} />
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
                        {defaultCollectorColumns
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
                                    const colDef = defaultCollectorColumns.find((c) => c.field === field)!;

                                    const getColumnWidth = (field: string) => {
                                        switch (field) {
                                            case "name":
                                                return { minWidth: 200, width: 'auto' };
                                            case "type":
                                                return { minWidth: 120, width: 120 };
                                            case "url":
                                                return { minWidth: 200, width: 'auto' };
                                            case "accessToken":
                                                return { minWidth: 120, width: 120 };
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
                            {sortedCollectors.length > 0 ? (
                                sortedCollectors.map((collector) => (
                                    <CollectorTableRow
                                        key={collector.id}
                                        collector={collector}
                                        visibleCols={visibleCols}
                                        allColumns={defaultCollectorColumns}
                                        onDelete={handleDelete}
                                        onEdit={handleEdit}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={visibleCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">No collectors found</Typography>
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
                    {sortedCollectors.length > 0 ? (
                        sortedCollectors.map((collector) => (
                            <CollectorCard
                                key={collector.id}
                                collector={collector}
                                viewMode={viewMode as 'standard' | 'mini'}
                                onDelete={handleDelete}
                                onEdit={handleEdit}
                            />
                        ))
                    ) : (
                        <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                            <Typography color="textSecondary">No collectors found</Typography>
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

            {/* Add Collector Modal */}
            <AddCollectorModal
                open={addCollectorModalOpen}
                onClose={() => setAddCollectorModalOpen(false)}
                onCollectorAdded={handleCollectorAdded}
                onCollectorAddedAndConfigure={handleCollectorAddedAndConfigure}
            />
        </Box>
    );
};

export default Collectors;