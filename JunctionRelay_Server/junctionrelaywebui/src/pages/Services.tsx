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
import RouterIcon from '@mui/icons-material/Router';
import ApiIcon from '@mui/icons-material/Api';
import ExtensionIcon from '@mui/icons-material/Extension';
import MinimizeIcon from '@mui/icons-material/Minimize';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SetupInstructions_Services from '../components/SetupInstructions_Services';
import { useTheme, useMediaQuery } from "@mui/material";

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
        // "REST API": { color: "info", icon: <ApiIcon fontSize="small" /> },
        // "Custom": { color: "secondary", icon: <ExtensionIcon fontSize="small" /> },
    };

    return typeMap[type] || { color: "default" as const, icon: <ApiIcon fontSize="small" /> };
};

// Memoized Service Card component for tile views
const ServiceCard = memo(({
    service,
    viewMode,
    onDelete,
    onEdit,
}: {
    service: any,
    viewMode: 'standard' | 'mini',
    onDelete: (e: React.MouseEvent, id: number) => void,
    onEdit: (e: React.MouseEvent, service: any) => void,
}) => {
    const navigate = useNavigate();
    const typeInfo = getServiceTypeInfo(service.type);

    const getCardHeight = () => {
        return viewMode === 'mini' ? 120 : 220;
    };

    const statusColor = service.status === 'Active' ? 'success' :
        service.status === 'Inactive' ? 'error' : 'default';

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
            onClick={() => navigate(`/configure-service/${service.id}`)}
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
                    : (service.status || 'Unknown')
                }
            </Box>

            <CardContent sx={{
                flex: 1,
                pt: viewMode === 'mini' ? 2.5 : 5,
                p: viewMode === 'mini' ? 1 : 2
            }}>
                {/* Service Name with type icon */}
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
                        {service.name}
                    </Typography>
                </Box>

                {/* Service Details */}
                {viewMode === 'standard' && (
                    <>
                        <Divider sx={{ mb: 1 }} />
                        <Box sx={{ mb: 1 }}>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Type:</strong> {service.type || "Unknown"}
                            </Typography>
                            {service.description && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Description:</strong> {service.description}
                                </Typography>
                            )}
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>ID:</strong> {service.uniqueIdentifier || "Not set"}
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
                                ? service.type?.substring(0, 8) + (service.type?.length > 8 ? '...' : '')
                                : service.type
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
                                    onEdit(e, service);
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
                                    onDelete(e, service.id);
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
const ServiceTableRow = memo(({
    service,
    visibleCols,
    allColumns,
    onDelete,
    onEdit,
}: {
    service: any,
    visibleCols: string[],
    allColumns: ServiceColumn[],
    onDelete: (e: React.MouseEvent, id: number) => void,
    onEdit: (e: React.MouseEvent, service: any) => void,
}) => {
    const navigate = useNavigate();

    const getServiceCell = useCallback((field: string) => {
        switch (field) {
            case "name":
                const typeInfo = getServiceTypeInfo(service.type);
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {typeInfo.icon}
                        <Typography fontWeight="medium" color="text.primary">
                            {service.name}
                        </Typography>
                    </Box>
                );
            case "type":
                const typeInfoChip = getServiceTypeInfo(service.type);
                return (
                    <Chip
                        label={service.type}
                        color={typeInfoChip.color}
                        size="small"
                        sx={{ fontSize: '0.75rem', height: 22 }}
                    />
                );
            case "description":
                return service.description || "-";
            case "uniqueIdentifier":
                return service.uniqueIdentifier || "-";
            case "status":
                const statusColor = service.status === 'Active' ? 'success' :
                    service.status === 'Inactive' ? 'error' : 'default';
                return (
                    <Chip
                        label={service.status || 'Unknown'}
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
                                onClick={(e) => onEdit(e, service)}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                onClick={(e) => onDelete(e, service.id)}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            default:
                return service[field] || "-";
        }
    }, [service, onDelete, onEdit]);

    return (
        <TableRow
            hover
            onClick={() => navigate(`/configure-service/${service.id}`)}
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
                        sx={{
                            ...columnWidth,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            padding: '8px 16px'
                        }}
                    >
                        {getServiceCell(field)}
                    </TableCell>
                );
            })}
        </TableRow>
    );
});

// AddService Modal Component
const AddServiceModal: React.FC<{
    open: boolean,
    onClose: () => void,
    onServiceAdded: () => void,
    onServiceAddedAndConfigure: (serviceId: number) => void
}> = ({ open, onClose, onServiceAdded, onServiceAddedAndConfigure }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);
    const [setupInstructionsMinimized, setSetupInstructionsMinimized] = useState<boolean>(false);
    const [service, setService] = useState<any>({
        name: "",
        description: "",
        type: "",
        url: "",
        accessToken: "",
        externalAccessToken: false,
        mqttBrokerAddress: "",
        mqttBrokerPort: "",
        mqttUsername: ""
    });
    const [encryptionPassword, setEncryptionPassword] = useState<string>("");
    const [error, setError] = useState<string>("");

    // Service type options for dropdown
    const serviceTypes = [
        { value: "", name: "Select Service Type", desc: "Choose a service type to begin" },
        { value: "MQTT Broker", name: "MQTT Broker", desc: "Message broker service" }
        // { value: "REST API", name: "REST API", desc: "HTTP REST API service" },
        // { value: "Custom", name: "Custom", desc: "Custom service configuration" }
    ];

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            // Reset to initial state when modal opens
            setService({
                name: "",
                description: "",
                type: "",
                url: "",
                accessToken: "",
                externalAccessToken: false,
                mqttBrokerAddress: "",
                mqttBrokerPort: "",
                mqttUsername: ""
            });
            setEncryptionPassword("");
            setError("");
        }
    }, [open]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent<any>) => {
        const { name, value } = e.target;
        setService({ ...service, [name]: value });
    };

    // Generate a unique identifier automatically
    const generateUniqueIdentifier = () => {
        return `${service.name.replace(/\s+/g, '_').toLowerCase()}_${service.type.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
    };

    // Handle form submission
    const handleAddService = async (configureAfter: boolean = false) => {
        setLoading(true);
        setError("");
        setConfigureAfterAdd(configureAfter);

        // Basic validation
        if (!service.name || !service.type) {
            setError("Name and Type are required!");
            setLoading(false);
            return;
        }

        if (service.type === "MQTT Broker" && !service.mqttBrokerAddress) {
            setError("MQTT Broker Address is required for MQTT Broker services!");
            setLoading(false);
            return;
        }

        if (service.type === "MQTT Broker" && !service.mqttBrokerPort) {
            setError("MQTT Broker Port is required for MQTT Broker services!");
            setLoading(false);
            return;
        }

        if (service.type === "REST API" && !service.url) {
            setError("URL is required for REST API services!");
            setLoading(false);
            return;
        }

        // Validate encryption password if external encryption is selected
        if (service.externalAccessToken && !encryptionPassword.trim()) {
            setError("Encryption password is required when using external password encryption.");
            setLoading(false);
            return;
        }

        // Send the request
        try {
            const uniqueIdentifier = generateUniqueIdentifier();

            const requestBody: any = {
                name: service.name,
                description: service.description,
                type: service.type,
                status: "Active",
                uniqueIdentifier: uniqueIdentifier,
                url: service.url,
                accessToken: service.accessToken,
                externalAccessToken: service.externalAccessToken,
                mqttBrokerAddress: service.mqttBrokerAddress,
                mqttBrokerPort: service.mqttBrokerPort,
                mqttUsername: service.mqttUsername,
                pollRate: 5000,
                sendRate: 5000
            };

            // If using external encryption, include the encryption password in a way the backend expects
            if (service.externalAccessToken && encryptionPassword) {
                requestBody.encryptionPassword = encryptionPassword;
            }

            const response = await fetch("/api/services", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
            });

            if (response.ok) {
                const result = await response.json();
                if (configureAfter && result && result.id) {
                    onServiceAddedAndConfigure(result.id);
                } else {
                    onServiceAdded();
                }
                onClose();
                return;
            }

            if (response.status === 500) {
                setError("A service with this name already exists. Service names must be unique.");
                setLoading(false);
                return;
            }

            let errorMessage = "Error adding service";
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorMessage;
            } catch (parseError) {
                errorMessage = response.statusText || errorMessage;
            }

            throw new Error(errorMessage);
        } catch (err: any) {
            if (
                err.message.includes("unique") ||
                err.message.includes("duplicate") ||
                err.message.toLowerCase().includes("already exists") ||
                err.message.includes("constraint") ||
                err.message.includes("Internal Server Error")
            ) {
                setError("A service with this name already exists. Service names must be unique.");
            } else {
                setError(err.message);
            }
            console.error("Error adding service:", err);
        } finally {
            setLoading(false);
        }
    };

    // Set default values based on selected service type
    useEffect(() => {
        if (service.type === "MQTT Broker") {
            setService((prev: any) => ({
                ...prev,
                name: "MQTT Broker",
                description: "MQTT message broker service",
                externalAccessToken: false,
                mqttBrokerPort: "1883"
            }));
        } else if (service.type === "REST API") {
            setService((prev: any) => ({
                ...prev,
                name: "REST API Service",
                description: "HTTP REST API service",
                externalAccessToken: false
            }));
        } else if (service.type === "Custom") {
            setService((prev: any) => ({
                ...prev,
                name: "Custom Service",
                description: "Custom service configuration",
                externalAccessToken: false
            }));
        } else {
            setService((prev: any) => ({
                ...prev,
                name: "",
                description: "",
                externalAccessToken: false
            }));
        }

        // Reset encryption password when service type changes
        setEncryptionPassword("");
    }, [service.type]);

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
                    Add Service
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
                        {/* Left side - Service types list (Desktop only) */}
                        <Box sx={{
                            width: { md: 280 },
                            borderRight: { md: '1px solid' },
                            borderColor: 'divider',
                            overflowY: 'auto',
                            bgcolor: 'action.hover',
                            display: { xs: 'none', md: 'block' }
                        }}>
                            <Typography variant="subtitle2" sx={{ p: 2, pb: 1, fontWeight: 'bold', color: 'text.secondary' }}>
                                Select Service Type
                            </Typography>
                            {serviceTypes.slice(1).map((serviceType) => (
                                <Box
                                    key={serviceType.value}
                                    onClick={() => setService({ ...service, type: serviceType.value })}
                                    sx={{
                                        p: 2,
                                        mx: 1,
                                        mb: 1,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        bgcolor: service.type === serviceType.value ? 'primary.main' : 'transparent',
                                        color: service.type === serviceType.value ? 'primary.contrastText' : 'text.primary',
                                        '&:hover': {
                                            bgcolor: service.type === serviceType.value ? 'primary.dark' : 'action.hover'
                                        },
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={service.type === serviceType.value ? 'bold' : 'medium'}>
                                        {serviceType.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        opacity: service.type === serviceType.value ? 0.9 : 0.7,
                                        display: 'block'
                                    }}>
                                        {serviceType.desc}
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
                                    {/* Service Type Dropdown - Mobile only */}
                                    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="service-type-label">Service Type *</InputLabel>
                                            <Select
                                                labelId="service-type-label"
                                                value={service.type}
                                                onChange={handleChange}
                                                name="type"
                                                required
                                                label="Service Type *"
                                            >
                                                {serviceTypes.map((type) => (
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

                                    {/* Only show form fields if service type is selected */}
                                    {service.type && (
                                        <>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Service Name"
                                                name="name"
                                                value={service.name}
                                                onChange={handleChange}
                                                required
                                                error={!!error && error.includes("name")}
                                                helperText={error && error.includes("name") ? "Name must be unique" : ""}
                                            />

                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Description"
                                                name="description"
                                                value={service.description}
                                                onChange={handleChange}
                                                multiline
                                                rows={2}
                                            />

                                            {/* REST API specific fields */}
                                            {service.type === "REST API" && (
                                                <>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="URL"
                                                        name="url"
                                                        value={service.url}
                                                        onChange={handleChange}
                                                        required
                                                    />

                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="Access Token"
                                                        name="accessToken"
                                                        value={service.accessToken}
                                                        onChange={handleChange}
                                                        type="password"
                                                    />
                                                </>
                                            )}

                                            {/* MQTT specific fields */}
                                            {service.type === "MQTT Broker" && (
                                                <>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="MQTT Broker Address"
                                                        name="mqttBrokerAddress"
                                                        value={service.mqttBrokerAddress}
                                                        onChange={handleChange}
                                                        required
                                                    />

                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="MQTT Broker Port"
                                                        name="mqttBrokerPort"
                                                        value={service.mqttBrokerPort}
                                                        onChange={handleChange}
                                                        required
                                                        placeholder="1883"
                                                    />

                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="MQTT Username"
                                                        name="mqttUsername"
                                                        value={service.mqttUsername}
                                                        onChange={handleChange}
                                                    />

                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        label="MQTT Password"
                                                        name="accessToken"
                                                        value={service.accessToken}
                                                        onChange={handleChange}
                                                        type="password"
                                                        helperText="Stored in AccessToken field for security consistency"
                                                    />
                                                </>
                                            )}
                                        </>
                                    )}
                                </Box>

                                {/* Security Options Section - Show for services that use AccessToken field */}
                                {service.type && (service.type === "REST API" || service.type === "MQTT Broker") && (
                                    <Box sx={{ mt: 3 }}>
                                        <Divider sx={{ mb: 2 }} />
                                        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                                            {service.type === "REST API" ? "Access Token Security" : "MQTT Password Security"}
                                        </Typography>

                                        <FormControl component="fieldset">
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    <input
                                                        type="radio"
                                                        id="local-encryption-service"
                                                        name="encryption-method-service"
                                                        checked={!service.externalAccessToken}
                                                        onChange={() => setService({ ...service, externalAccessToken: false })}
                                                        style={{ marginRight: '8px' }}
                                                    />
                                                    <label htmlFor="local-encryption-service" style={{ cursor: 'pointer' }}>
                                                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                            Save to local DB (Default)
                                                        </Typography>
                                                    </label>
                                                </Box>

                                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                                    <input
                                                        type="radio"
                                                        id="external-encryption-service"
                                                        name="encryption-method-service"
                                                        checked={service.externalAccessToken}
                                                        onChange={() => setService({ ...service, externalAccessToken: true })}
                                                        style={{ marginRight: '8px' }}
                                                    />
                                                    <label htmlFor="external-encryption-service" style={{ cursor: 'pointer' }}>
                                                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                            Encrypt with external password
                                                        </Typography>
                                                    </label>
                                                </Box>
                                            </Box>
                                        </FormControl>

                                        {/* Encryption Password field - only show if external encryption is selected */}
                                        {service.externalAccessToken && (
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
                                                <strong>Local DB:</strong> {service.type === "REST API" ? "AccessToken" : "MQTT Password"} will be encrypted but the encryption keys exist in the application directory.
                                                This is usually sufficient if you have secured your local network/docker environment and if the {service.type === "REST API" ? "AccessToken" : "password"} is not high value.
                                                The application will decrypt automatically on app start so you do not need to re-enter the {service.type === "REST API" ? "token" : "password"}.
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                <strong>External Password:</strong> {service.type === "REST API" ? "AccessToken" : "MQTT Password"} will be encrypted using a password that is not saved in the DB -
                                                this provides maximum security for your {service.type === "REST API" ? "AccessToken" : "MQTT password"}, but means you must enter the password on application start
                                                for each service that is encrypted via this method before it can be used. If you lose your password,
                                                you will not be able to recover the service and you will need to recreate it.
                                            </Typography>
                                        </Box>
                                    </Box>
                                )}
                            </Box>

                            {/* Instructions - responsive height - Hide on mobile */}
                            {service.type && (
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
                                            <SetupInstructions_Services serviceType={service.type} />
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
                                    onClick={() => handleAddService(false)}
                                    size="small"
                                    startIcon={<AddIcon />}
                                    disabled={loading || !service.type}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {loading && !configureAfterAdd ? "Adding..." : "Add Service"}
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddService(true)}
                                    size="small"
                                    color="secondary"
                                    startIcon={<EditIcon />}
                                    disabled={loading || !service.type}
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