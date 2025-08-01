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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PhotoIcon from '@mui/icons-material/Photo';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import GridOnIcon from '@mui/icons-material/GridOn';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import AppsIcon from '@mui/icons-material/Apps';
import ImageIcon from '@mui/icons-material/Image';
import ExtensionIcon from '@mui/icons-material/Extension';
import SetupInstructions_FrameEngine from '../components/SetupInstructions_FrameEngine';
import { useTheme, useMediaQuery } from "@mui/material";

// Types
type ViewMode = 'table' | 'standard' | 'mini';
type SortDirection = 'asc' | 'desc';

interface FrameLayoutListItem {
    id: string;
    isTemplate?: boolean;
    displayName: string;
    description?: string;
    layoutType: string;
    rows?: number;
    columns?: number;
}

interface FrameEngineColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    sortable?: boolean;
}

// Storage keys
const STORAGE_KEY_FRAMEENGINE_COLUMNS = "frameengine_visible_columns";
const STORAGE_KEY_FRAMEENGINE_SORT = "frameengine_sort_state";
const STORAGE_KEY_FRAMEENGINE_VIEW_MODE = "junctionrelay_frameengine_view_mode";

// Column definitions
const defaultFrameEngineColumns: FrameEngineColumn[] = [
    { field: "actions", label: "Actions", align: "right", sortable: false },
    { field: "name", label: "Name", align: "left", sortable: true },
    { field: "template", label: "Template", align: "center", sortable: true },
    { field: "type", label: "Type", align: "left", sortable: true },
    { field: "description", label: "Description", align: "left", sortable: true },
    { field: "dimensions", label: "Dimensions", align: "center", sortable: false },
];

// Default visible columns
const defaultVisibleColumns = ["name", "template", "type", "description", "dimensions", "actions"];

// Helper function to get frame layout type info with colors and icons
const getFrameLayoutTypeInfo = (type: string) => {
    const typeMap: Record<string, { color: "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error", icon: React.ReactNode }> = {
        "FRAME_SENSOR_GRID": { color: "primary", icon: <GridOnIcon fontSize="small" /> },
        "FRAME_CALENDAR": { color: "secondary", icon: <CalendarTodayIcon fontSize="small" /> },
        "FRAME_DASHBOARD": { color: "info", icon: <DashboardIcon fontSize="small" /> },
        "FRAME_CHART": { color: "warning", icon: <ShowChartIcon fontSize="small" /> },
        "FRAME_QUAD": { color: "success", icon: <AppsIcon fontSize="small" /> },
        "FRAME_IMAGE": { color: "error", icon: <ImageIcon fontSize="small" /> },
        "FRAME_CUSTOM": { color: "default", icon: <ExtensionIcon fontSize="small" /> },
    };

    return typeMap[type] || { color: "default" as const, icon: <PhotoIcon fontSize="small" /> };
};

// Memoized Frame Layout Card component for tile views
const FrameLayoutCard = memo(({
    frameLayout,
    viewMode,
    onDelete,
    onEdit,
    onClone,
}: {
    frameLayout: FrameLayoutListItem,
    viewMode: 'standard' | 'mini',
    onDelete: (e: React.MouseEvent, id: string) => void,
    onEdit: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void,
    onClone: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void,
}) => {
    const navigate = useNavigate();
    const typeInfo = getFrameLayoutTypeInfo(frameLayout.layoutType);

    const getCardHeight = () => {
        return viewMode === 'mini' ? 120 : 220;
    };

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
                borderColor: frameLayout.isTemplate ? 'success.main' : 'divider',
            }}
            onClick={() => navigate(`/configure-frame/${frameLayout.id}`)}
        >
            {/* Template Badge */}
            {frameLayout.isTemplate && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: viewMode === 'mini' ? 4 : 8,
                        right: viewMode === 'mini' ? 4 : 8,
                        backgroundColor: 'success.main',
                        color: 'success.contrastText',
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
                    {viewMode === 'mini' ? '●' : 'TEMPLATE'}
                </Box>
            )}

            <CardContent sx={{
                flex: 1,
                pt: viewMode === 'mini' ? 2.5 : 5,
                p: viewMode === 'mini' ? 1 : 2
            }}>
                {/* Frame Layout Name with type icon */}
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
                        {frameLayout.displayName}
                    </Typography>
                </Box>

                {/* Frame Layout Details */}
                {viewMode === 'standard' && (
                    <>
                        <Divider sx={{ mb: 1 }} />
                        <Box sx={{ mb: 1 }}>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Type:</strong> {frameLayout.layoutType || "Unknown"}
                            </Typography>
                            {frameLayout.description && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Description:</strong> {frameLayout.description}
                                </Typography>
                            )}
                            {frameLayout.rows && frameLayout.columns && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Size:</strong> {frameLayout.rows}×{frameLayout.columns}
                                </Typography>
                            )}
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
                                ? frameLayout.layoutType?.substring(0, 8) + (frameLayout.layoutType?.length > 8 ? '...' : '')
                                : frameLayout.layoutType
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
                        {!frameLayout.isTemplate && (
                            <Tooltip title="Edit">
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEdit(e, frameLayout);
                                    }}
                                >
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip title="Clone">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClone(e, frameLayout);
                                }}
                            >
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        {!frameLayout.isTemplate && (
                            <Tooltip title="Delete">
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(e, frameLayout.id);
                                    }}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                )}
            </CardContent>
        </Card>
    );
});

// Memoized TableRow component
const FrameLayoutTableRow = memo(({
    frameLayout,
    visibleCols,
    allColumns,
    onDelete,
    onEdit,
    onClone,
}: {
    frameLayout: FrameLayoutListItem,
    visibleCols: string[],
    allColumns: FrameEngineColumn[],
    onDelete: (e: React.MouseEvent, id: string) => void,
    onEdit: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void,
    onClone: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void,
}) => {
    const navigate = useNavigate();

    const getFrameLayoutCell = useCallback((field: string) => {
        switch (field) {
            case "name":
                const typeInfo = getFrameLayoutTypeInfo(frameLayout.layoutType);
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {typeInfo.icon}
                        <Typography fontWeight="medium" color="text.primary">
                            {frameLayout.displayName}
                        </Typography>
                    </Box>
                );
            case "template":
                return frameLayout.isTemplate ? (
                    <CheckIcon fontSize="small" sx={{ color: "success.main" }} />
                ) : (
                    ""
                );
            case "type":
                const typeInfoChip = getFrameLayoutTypeInfo(frameLayout.layoutType);
                return (
                    <Chip
                        label={frameLayout.layoutType}
                        color={typeInfoChip.color}
                        size="small"
                        sx={{ fontSize: '0.75rem', height: 22 }}
                    />
                );
            case "description":
                return frameLayout.description || "-";
            case "dimensions":
                return frameLayout.rows && frameLayout.columns ? `${frameLayout.rows}×${frameLayout.columns}` : "-";
            case "actions":
                return (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        {!frameLayout.isTemplate && (
                            <Tooltip title="Edit">
                                <IconButton
                                    size="small"
                                    onClick={(e) => onEdit(e, frameLayout)}
                                >
                                    <EditIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip title="Clone">
                            <IconButton
                                size="small"
                                onClick={(e) => onClone(e, frameLayout)}
                            >
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        {!frameLayout.isTemplate && (
                            <Tooltip title="Delete">
                                <IconButton
                                    size="small"
                                    onClick={(e) => onDelete(e, frameLayout.id)}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                );
            default:
                return frameLayout[field as keyof FrameLayoutListItem] || "-";
        }
    }, [frameLayout, onDelete, onEdit, onClone]);

    return (
        <TableRow
            hover
            onClick={() => navigate(`/configure-frame/${frameLayout.id}`)}
            sx={{ cursor: "pointer" }}
        >
            {visibleCols.map((field) => {
                const colDef = allColumns.find((c) => c.field === field)!;

                const getColumnWidth = (field: string) => {
                    switch (field) {
                        case "name":
                            return { minWidth: 200, width: 'auto' };
                        case "template":
                            return { minWidth: 80, width: 80 };
                        case "type":
                            return { minWidth: 120, width: 120 };
                        case "description":
                            return { minWidth: 200, width: 'auto' };
                        case "dimensions":
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
                        sx={{
                            ...columnWidth,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            padding: '8px 16px'
                        }}
                    >
                        {getFrameLayoutCell(field)}
                    </TableCell>
                );
            })}
        </TableRow>
    );
});

// AddFrameLayout Modal Component
const AddFrameLayoutModal: React.FC<{
    open: boolean,
    onClose: () => void,
    onFrameLayoutAdded: (newFrameLayoutId?: string, andConfigure?: boolean) => void
}> = ({ open, onClose, onFrameLayoutAdded }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);
    const [frameLayout, setFrameLayout] = useState<any>({
        displayName: "",
        layoutType: "",
        description: "",
        rows: 2,
        columns: 2
    });
    const [error, setError] = useState<string>("");

    // Frame layout type options for dropdown
    const frameLayoutTypes = [
        { value: "", name: "Select Frame Layout Type", desc: "Choose a frame layout type to begin" },
        { value: "FRAME_SENSOR_GRID", name: "Sensor Grid", desc: "Grid-based sensor data display" },
        { value: "FRAME_CALENDAR", name: "Calendar View", desc: "TV Guide style calendar layout" },
        { value: "FRAME_DASHBOARD", name: "Dashboard", desc: "Multi-widget dashboard layout" },
        { value: "FRAME_CHART", name: "Chart Display", desc: "Data visualization and charts" },
        { value: "FRAME_QUAD", name: "Quad Layout", desc: "Four-panel display arrangement" },
        { value: "FRAME_IMAGE", name: "Image Display", desc: "Background image with overlays" },
        { value: "FRAME_CUSTOM", name: "Custom Frame", desc: "Custom frame layout configuration" }
    ];

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            setFrameLayout({
                displayName: "",
                layoutType: "",
                description: "",
                rows: 2,
                columns: 2
            });
            setError("");
        }
    }, [open]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFrameLayout({ ...frameLayout, [name]: value });
    };

    const handleTypeChange = (e: SelectChangeEvent<string>) => {
        setFrameLayout({ ...frameLayout, layoutType: e.target.value });
    };

    // Handle form submission
    const handleAddFrameLayout = async (configureAfter: boolean = false) => {
        setLoading(true);
        setError("");
        setConfigureAfterAdd(configureAfter);

        if (!frameLayout.displayName || !frameLayout.layoutType) {
            setError("Name and Type are required!");
            setLoading(false);
            return;
        }

        try {
            const newFrameLayout = {
                displayName: frameLayout.displayName,
                layoutType: frameLayout.layoutType,
                description: frameLayout.description,
                rows: frameLayout.rows,
                columns: frameLayout.columns
            };

            const response = await fetch("/api/frameengine", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newFrameLayout),
            });

            if (response.ok) {
                const result = await response.json();
                onFrameLayoutAdded(result.id, configureAfter);
                onClose();
                return;
            }

            const errorData = await response.json();
            throw new Error(errorData.message || "Error adding frame layout");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Set default values based on selected layout type
    useEffect(() => {
        if (frameLayout.layoutType === "FRAME_SENSOR_GRID") {
            setFrameLayout((prev: any) => ({
                ...prev,
                displayName: "Sensor Grid Frame",
                description: "Grid-based sensor data display for frame rendering"
            }));
        } else if (frameLayout.layoutType === "FRAME_CALENDAR") {
            setFrameLayout((prev: any) => ({
                ...prev,
                displayName: "Calendar Frame",
                description: "TV Guide style calendar layout with episode listings"
            }));
        } else if (frameLayout.layoutType === "FRAME_DASHBOARD") {
            setFrameLayout((prev: any) => ({
                ...prev,
                displayName: "Dashboard Frame",
                description: "Multi-widget dashboard layout for comprehensive displays"
            }));
        } else if (frameLayout.layoutType === "FRAME_CHART") {
            setFrameLayout((prev: any) => ({
                ...prev,
                displayName: "Chart Frame",
                description: "Data visualization and chart display frame"
            }));
        } else if (frameLayout.layoutType === "FRAME_QUAD") {
            setFrameLayout((prev: any) => ({
                ...prev,
                displayName: "Quad Frame",
                description: "Four-panel display arrangement",
                rows: 2,
                columns: 2
            }));
        } else if (frameLayout.layoutType === "FRAME_IMAGE") {
            setFrameLayout((prev: any) => ({
                ...prev,
                displayName: "Image Frame",
                description: "Background image with data overlays"
            }));
        } else if (frameLayout.layoutType === "FRAME_CUSTOM") {
            setFrameLayout((prev: any) => ({
                ...prev,
                displayName: "Custom Frame",
                description: "Custom frame layout configuration"
            }));
        } else {
            setFrameLayout((prev: any) => ({
                ...prev,
                displayName: "",
                description: ""
            }));
        }
    }, [frameLayout.layoutType]);

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: { xs: '95%', sm: '90%', md: '80%' },
                maxWidth: { xs: 'none', md: 900 },
                height: { xs: '90vh', md: '80vh' },
                bgcolor: 'background.paper',
                p: 0,
                boxShadow: 24,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column'
            }}>
                <Typography variant="h6" sx={{
                    p: { xs: 2, md: 3 },
                    pb: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    fontSize: { xs: '1.1rem', md: '1.25rem' }
                }}>
                    Add Frame Layout
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
                        overflow: 'hidden'
                    }}>
                        {/* Left side - Layout types list (Desktop only) */}
                        <Box sx={{
                            width: { md: 280 },
                            borderRight: { md: '1px solid' },
                            borderColor: 'divider',
                            overflowY: 'auto',
                            bgcolor: 'action.hover',
                            display: { xs: 'none', md: 'block' }
                        }}>
                            <Typography variant="subtitle2" sx={{ p: 2, pb: 1, fontWeight: 'bold', color: 'text.secondary' }}>
                                Select Frame Layout Type
                            </Typography>
                            {frameLayoutTypes.slice(1).map((layoutType) => (
                                <Box
                                    key={layoutType.value}
                                    onClick={() => setFrameLayout({ ...frameLayout, layoutType: layoutType.value })}
                                    sx={{
                                        p: 2,
                                        mx: 1,
                                        mb: 1,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        bgcolor: frameLayout.layoutType === layoutType.value ? 'primary.main' : 'transparent',
                                        color: frameLayout.layoutType === layoutType.value ? 'primary.contrastText' : 'text.primary',
                                        '&:hover': {
                                            bgcolor: frameLayout.layoutType === layoutType.value ? 'primary.dark' : 'action.hover'
                                        },
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={frameLayout.layoutType === layoutType.value ? 'bold' : 'medium'}>
                                        {layoutType.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        opacity: frameLayout.layoutType === layoutType.value ? 0.9 : 0.7,
                                        display: 'block'
                                    }}>
                                        {layoutType.desc}
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
                                borderBottom: '1px solid',
                                borderColor: 'divider'
                            }}>
                                {error && (
                                    <Alert severity="error" sx={{ mb: 2 }}>
                                        {error}
                                    </Alert>
                                )}

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {/* Layout Type Dropdown - Mobile only */}
                                    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="frame-layout-type-label">Frame Layout Type *</InputLabel>
                                            <Select
                                                labelId="frame-layout-type-label"
                                                value={frameLayout.layoutType}
                                                onChange={handleTypeChange}
                                                label="Frame Layout Type *"
                                            >
                                                {frameLayoutTypes.map((type) => (
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

                                    {/* Only show form fields if layout type is selected */}
                                    {frameLayout.layoutType && (
                                        <>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Frame Layout Name"
                                                name="displayName"
                                                value={frameLayout.displayName}
                                                onChange={handleChange}
                                                required
                                            />

                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Description"
                                                name="description"
                                                value={frameLayout.description}
                                                onChange={handleChange}
                                                multiline
                                                rows={2}
                                            />

                                            <Box sx={{ display: 'flex', gap: 2 }}>
                                                <TextField
                                                    size="small"
                                                    label="Rows"
                                                    name="rows"
                                                    type="number"
                                                    value={frameLayout.rows}
                                                    onChange={handleChange}
                                                    inputProps={{ min: 1, max: 100 }}
                                                    sx={{ flex: 1 }}
                                                />
                                                <TextField
                                                    size="small"
                                                    label="Columns"
                                                    name="columns"
                                                    type="number"
                                                    value={frameLayout.columns}
                                                    onChange={handleChange}
                                                    inputProps={{ min: 1, max: 100 }}
                                                    sx={{ flex: 1 }}
                                                />
                                            </Box>
                                        </>
                                    )}
                                </Box>
                            </Box>

                            {/* Instructions - responsive height */}
                            {frameLayout.layoutType && (
                                <Box sx={{
                                    flex: 1,
                                    p: { xs: 2, md: 3 },
                                    overflowY: 'auto',
                                    bgcolor: 'background.default',
                                    minHeight: { xs: '200px', md: 'auto' }
                                }}>
                                    <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', md: '1.25rem' } }}>
                                        Frame Layout Information
                                    </Typography>
                                    <SetupInstructions_FrameEngine layoutType={frameLayout.layoutType} />
                                </Box>
                            )}

                            {/* Action buttons - responsive layout */}
                            <Box sx={{
                                p: { xs: 2, md: 3 },
                                borderTop: '1px solid',
                                borderColor: 'divider',
                                display: "flex",
                                flexDirection: { xs: 'column', sm: 'row' },
                                gap: { xs: 1, sm: 2 }
                            }}>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddFrameLayout(false)}
                                    size="small"
                                    startIcon={<AddIcon />}
                                    disabled={loading || !frameLayout.layoutType}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {loading && !configureAfterAdd ? "Adding..." : "Add Frame Layout"}
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddFrameLayout(true)}
                                    size="small"
                                    color="secondary"
                                    startIcon={<EditIcon />}
                                    disabled={loading || !frameLayout.layoutType}
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

// Main FrameEngine Component
const FrameEngine = () => {
    const [frameLayouts, setFrameLayouts] = useState<FrameLayoutListItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [resetLoading, setResetLoading] = useState<boolean>(false);
    const [addFrameLayoutModalOpen, setAddFrameLayoutModalOpen] = useState<boolean>(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    // View mode and table management state
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_FRAMEENGINE_VIEW_MODE);
        return (stored as ViewMode) || 'table';
    });

    const [visibleCols, setVisibleCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_FRAMEENGINE_COLUMNS);
        return stored ? JSON.parse(stored) : defaultVisibleColumns;
    });

    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_FRAMEENGINE_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'displayName', order: 'asc' };
        } catch (e) {
            return { orderBy: 'displayName', order: 'asc' };
        }
    });

    // Popover anchor for column management
    const [anchorCols, setAnchorCols] = useState<HTMLElement | null>(null);

    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Persist states
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_FRAMEENGINE_VIEW_MODE, viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_FRAMEENGINE_COLUMNS, JSON.stringify(visibleCols));
    }, [visibleCols]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_FRAMEENGINE_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Show snackbar with configurable severity
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

    const fetchFrameLayouts = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/frameengine");
            if (!response.ok) {
                throw new Error("Failed to fetch frame layouts");
            }
            const data = await response.json();
            setFrameLayouts(data);
        } catch (err: any) {
            showSnackbar("Error fetching frame layouts", "error");
            console.error("Error fetching frame layouts:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFrameLayouts();
    }, []);

    // Listen for view mode changes from bottom action bar (mobile only) 
    useEffect(() => {
        const handleBottomActionViewModeChange = (e: CustomEvent) => {
            // Only respond to bottom action bar changes when in mobile mode
            if (isMobile && e.detail.mode) {
                const newMode = e.detail.mode as ViewMode;
                setViewMode(newMode);
                localStorage.setItem(STORAGE_KEY_FRAMEENGINE_VIEW_MODE, newMode);
            }
        };

        // Listen for localStorage changes from other tabs/windows
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY_FRAMEENGINE_VIEW_MODE && e.newValue) {
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
        const handleAddFrameLayout = () => {
            console.log('Bottom bar: Add frame layout requested');
            setAddFrameLayoutModalOpen(true);
        };

        const handleResetAll = () => {
            console.log('Bottom bar: Reset all requested');
            handleResetAll();
        };

        // Add event listeners for bottom action bar
        window.addEventListener('bottom-action-add-frame', handleAddFrameLayout);
        window.addEventListener('bottom-action-reset-all', handleResetAll);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-add-frame', handleAddFrameLayout);
            window.removeEventListener('bottom-action-reset-all', handleResetAll);
        };
    }, []);

    // Sort frame layouts
    const sortedFrameLayouts = useMemo(() => {
        const { orderBy, order } = sortState;
        return [...frameLayouts].sort((a, b) => {
            let valueA: any;
            let valueB: any;

            switch (orderBy) {
                case 'name':
                case 'displayName':
                    valueA = a.displayName?.toLowerCase() || '';
                    valueB = b.displayName?.toLowerCase() || '';
                    break;
                case 'type':
                case 'layoutType':
                    valueA = a.layoutType?.toLowerCase() || '';
                    valueB = b.layoutType?.toLowerCase() || '';
                    break;
                case 'description':
                    valueA = a.description?.toLowerCase() || '';
                    valueB = b.description?.toLowerCase() || '';
                    break;
                case 'template':
                case 'isTemplate':
                    valueA = a.isTemplate ? 1 : 0;
                    valueB = b.isTemplate ? 1 : 0;
                    break;
                default:
                    valueA = a[orderBy as keyof FrameLayoutListItem] || '';
                    valueB = b[orderBy as keyof FrameLayoutListItem] || '';
            }

            if (valueA < valueB) {
                return order === 'asc' ? -1 : 1;
            }
            if (valueA > valueB) {
                return order === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [frameLayouts, sortState]);

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
    const handleAddFrameLayout = () => {
        setAddFrameLayoutModalOpen(true);
    };

    const handleFrameLayoutAdded = (newFrameLayoutId?: string, andConfigure: boolean = false) => {
        if (andConfigure && newFrameLayoutId) {
            navigate(`/configure-frame/${newFrameLayoutId}`);
        } else {
            fetchFrameLayouts();
            showSnackbar("Frame layout added successfully", "success");
        }
    };

    const handleResetAll = async () => {
        setResetLoading(true);
        try {
            const response = await fetch("/api/frameengine/restoreAll", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            if (!response.ok) {
                throw new Error("Failed to reset all frame layout templates");
            }
            await fetchFrameLayouts();
            showSnackbar("All frame layout templates have been restored or reset to defaults", "success");
        } catch (err: any) {
            showSnackbar("Error resetting frame layouts", "error");
        } finally {
            setResetLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, frameLayoutId: string) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this frame layout?")) return;
        try {
            const response = await fetch(`/api/frameengine/${frameLayoutId}`, { method: "DELETE" });
            if (!response.ok) throw new Error("Failed to delete frame layout");
            await fetchFrameLayouts();
            showSnackbar("Frame layout deleted successfully", "success");
        } catch (err: any) {
            showSnackbar("Error deleting frame layout", "error");
        }
    };

    const handleEdit = (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => {
        e.stopPropagation();
        navigate(`/configure-frame/${frameLayout.id}`);
    };

    const handleClone = async (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => {
        e.stopPropagation();
        try {
            const originalId = parseInt(frameLayout.id, 10);
            const response = await fetch("/api/frameengine/clone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ originalId })
            });
            if (!response.ok) throw new Error("Failed to clone frame layout");
            await fetchFrameLayouts();
            showSnackbar("Frame layout cloned successfully", "success");
        } catch (err: any) {
            showSnackbar("Error cloning frame layout", "error");
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
        <Box sx={{ padding: 2 }}>
            {/* Page Header - Hide on mobile */}
            {!isMobile && (
                <Typography variant="h6" sx={{ mb: 2 }}>
                    FrameEngine Management
                </Typography>
            )}

            {/* Management Buttons - Hide on mobile since bottom action bar handles it */}
            {!isMobile && (
                <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleAddFrameLayout}
                        size="small"
                        startIcon={<AddIcon />}
                    >
                        Add Frame Layout
                    </Button>
                    <Button
                        variant="outlined"
                        onClick={handleResetAll}
                        size="small"
                        startIcon={resetLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
                        disabled={resetLoading}
                    >
                        Reset/Restore All Frame Layout Templates
                    </Button>
                </Box>
            )}

            {/* Table header with view mode toggle and column selector */}
            <Box display="flex" alignItems="center" mb={1} flexWrap="wrap" gap={2}>
                <Typography variant="h6">FrameEngine</Typography>

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
                                <ListItemText primary={defaultFrameEngineColumns.find((c) => c.field === field)!.label} />
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
                        {defaultFrameEngineColumns
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
                                    const colDef = defaultFrameEngineColumns.find((c) => c.field === field)!;

                                    const getColumnWidth = (field: string) => {
                                        switch (field) {
                                            case "name":
                                                return { minWidth: 200, width: 'auto' };
                                            case "template":
                                                return { minWidth: 80, width: 80 };
                                            case "type":
                                                return { minWidth: 120, width: 120 };
                                            case "description":
                                                return { minWidth: 200, width: 'auto' };
                                            case "dimensions":
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
                            {sortedFrameLayouts.length > 0 ? (
                                sortedFrameLayouts.map((frameLayout) => (
                                    <FrameLayoutTableRow
                                        key={frameLayout.id}
                                        frameLayout={frameLayout}
                                        visibleCols={visibleCols}
                                        allColumns={defaultFrameEngineColumns}
                                        onDelete={handleDelete}
                                        onEdit={handleEdit}
                                        onClone={handleClone}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={visibleCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">No frame layouts found</Typography>
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
                    {sortedFrameLayouts.length > 0 ? (
                        sortedFrameLayouts.map((frameLayout) => (
                            <FrameLayoutCard
                                key={frameLayout.id}
                                frameLayout={frameLayout}
                                viewMode={viewMode as 'standard' | 'mini'}
                                onDelete={handleDelete}
                                onEdit={handleEdit}
                                onClone={handleClone}
                            />
                        ))
                    ) : (
                        <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                            <Typography color="textSecondary">No frame layouts found</Typography>
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

            {/* Add Frame Layout Modal */}
            <AddFrameLayoutModal
                open={addFrameLayoutModalOpen}
                onClose={() => setAddFrameLayoutModalOpen(false)}
                onFrameLayoutAdded={handleFrameLayoutAdded}
            />
        </Box>
    );
};

export default FrameEngine;