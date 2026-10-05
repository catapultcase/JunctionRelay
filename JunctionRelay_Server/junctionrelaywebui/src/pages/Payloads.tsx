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
    Checkbox,
    ToggleButtonGroup,
    ToggleButton,
    Card,
    CardContent,
    Divider,
    FormControlLabel,
    Tabs,
    Tab,
    Accordion,
    AccordionSummary,
    AccordionDetails,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
// Icon imports
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import GridOnIcon from '@mui/icons-material/GridOn';
import RadioIcon from '@mui/icons-material/Radio';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import AppsIcon from '@mui/icons-material/Apps';
import GridViewIcon from '@mui/icons-material/GridView';
import ColorLensIcon from '@mui/icons-material/ColorLens';
import ExtensionIcon from '@mui/icons-material/Extension';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import SetupInstructions_Payloads from '../components/SetupInstructions_Payloads';
import Payloads_ConfigurePayloadModal from '../components/Payloads_ConfigurePayloadModal';
import { FrameEngine_ProtocolPluginsTab, FrameEngine_CloudProtocolsTab, FrameEngine_MyProtocolUploadsTab } from '@junctionrelay/frameengine';
import type { CloudAuthState } from '@junctionrelay/frameengine';
import { useAuth } from '../auth/AuthContext';
import { useTheme, useMediaQuery } from "@mui/material";
import { usePageTitle } from '../hooks/usePageTitle';
import { errorMessage } from '../utils/errors';
import type { ViewMode } from '../types/devices';
import { isViewMode, viewModeFromEvent } from '../types/payloads';

// Types
type SortDirection = 'asc' | 'desc';

interface LayoutListItem {
    id: string;
    isTemplate?: boolean;
    displayName: string;
    description?: string;
    layoutType: string;
    rows?: number;
    columns?: number;
}

// The add-layout form; rows/columns are '' while their input is cleared
interface NewLayoutForm {
    displayName: string;
    layoutType: string;
    description: string;
    rows: number | '';
    columns: number | '';
}

const EMPTY_LAYOUT_FORM: NewLayoutForm = {
    displayName: "",
    layoutType: "",
    description: "",
    rows: 2,
    columns: 2
};

interface PayloadColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    sortable?: boolean;
}

interface Junction {
    junctionId: number;
    junctionName: string;
    layoutIds: {
        frameLayoutId?: number;
        screenLayoutId?: number;
    }[];
}

interface DeviceScreenDefault {
    deviceId: number;
    deviceName: string;
    screenKey: string;
    screenDisplayName: string;
    frameLayoutId?: number;
    screenLayoutId?: number;
}

interface LayoutUsageResponse {
    junctionUsages: Junction[];
    deviceScreenDefaults: DeviceScreenDefault[];
}

// Storage keys
const STORAGE_KEY_PAYLOADS_COLUMNS = "payloads_visible_columns";
const STORAGE_KEY_PAYLOADS_SORT = "payloads_sort_state";
const STORAGE_KEY_PAYLOADS_VIEW_MODE = "junctionrelay_payloads_view_mode";
const STORAGE_KEY_PAYLOADS_ACTIVE_TAB = "payloads_active_tab";

// Column definitions
const defaultPayloadColumns: PayloadColumn[] = [
    { field: "actions", label: "Actions", align: "right", sortable: false },
    { field: "name", label: "Name", align: "left", sortable: true },
    { field: "template", label: "Template", align: "center", sortable: true },
    { field: "type", label: "Type", align: "left", sortable: true },
    { field: "description", label: "Description", align: "left", sortable: true },
    { field: "dimensions", label: "Dimensions", align: "center", sortable: false },
];

// Default visible columns
const defaultVisibleColumns = ["name", "template", "type", "description", "dimensions","actions"];

// Helper function to get payload type info with colors and icons
const getPayloadTypeInfo = (type: string) => {
    const typeMap: Record<string, { color: "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error", icon: React.ReactNode }> = {
        "LVGL_GRID": { color: "primary", icon: <GridOnIcon fontSize="small" /> },
        "LVGL_RADIO": { color: "secondary", icon: <RadioIcon fontSize="small" /> },
        "LVGL_PLOTTER": { color: "info", icon: <ShowChartIcon fontSize="small" /> },
        "QUAD": { color: "warning", icon: <AppsIcon fontSize="small" /> },
        "MATRIX": { color: "success", icon: <GridViewIcon fontSize="small" /> },
        "NEOPIXEL": { color: "error", icon: <ColorLensIcon fontSize="small" /> },
        "CUSTOM": { color: "default", icon: <ExtensionIcon fontSize="small" /> },
    };

    return typeMap[type] || { color: "default" as const, icon: <ExtensionIcon fontSize="small" /> };
};

// Memoized Payload Card component for tile views
const PayloadCard = memo(({
    payload,
    viewMode,
    onDelete,
    onEdit,
    onClone,
    junctions,
    deviceScreenDefaults,
}: {
    payload: LayoutListItem,
    viewMode: 'standard' | 'mini',
    onDelete: (e: React.MouseEvent, id: string) => void,
    onEdit: (e: React.MouseEvent, payload: LayoutListItem) => void,
    onClone: (e: React.MouseEvent, payload: LayoutListItem) => void,
    junctions: Junction[],
    deviceScreenDefaults: DeviceScreenDefault[],
}) => {
    const navigate = useNavigate();
    const typeInfo = getPayloadTypeInfo(payload.layoutType);

    // Find junctions that use this screen layout
    const usedByJunctions = junctions.filter(junction => {
        return junction.layoutIds.some(layoutIdPair => {
            const layoutId = layoutIdPair.screenLayoutId;
            return layoutId && String(layoutId) === String(payload.id);
        });
    });

    // Find device screens that have this layout as default
    const deviceScreensUsingAsDefault = deviceScreenDefaults.filter(ds => {
        const layoutId = ds.screenLayoutId;
        return layoutId && String(layoutId) === String(payload.id);
    });

    // Check if layout is in use (by junctions or as device screen default)
    const isInUse = usedByJunctions.length > 0 || deviceScreensUsingAsDefault.length > 0;

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
                borderColor: payload.isTemplate ? 'success.main' : 'divider',
            }}
            onClick={() => navigate(`/configure-payload/${payload.id}`)}
        >
            {/* Template Badge */}
            {payload.isTemplate && (
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
                {/* Payload Name with type icon */}
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
                        {payload.displayName}
                    </Typography>
                </Box>

                {/* Payload Details */}
                {viewMode === 'standard' && (
                    <>
                        <Divider sx={{ mb: 1 }} />
                        <Box sx={{ mb: 1 }}>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Type:</strong> {payload.layoutType || "Unknown"}
                            </Typography>
                            {payload.description && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Description:</strong> {payload.description}
                                </Typography>
                            )}
                            {payload.rows && payload.columns && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Size:</strong> {payload.rows}×{payload.columns}
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
                                ? payload.layoutType?.substring(0, 8) + (payload.layoutType?.length > 8 ? '...' : '')
                                : payload.layoutType
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
            </CardContent>

            {/* Action Buttons at Bottom - Outside CardContent */}
            <Box sx={{
                p: viewMode === 'mini' ? 0.5 : 1,
                pt: 0,
                display: 'flex',
                gap: viewMode === 'mini' ? 0.5 : 1
            }}>
                <Tooltip title="Edit">
                    <IconButton
                        size="small"
                        onClick={(e) => {
                            e.stopPropagation();
                            onEdit(e, payload);
                        }}
                        sx={{
                            padding: viewMode === 'mini' ? '4px' : '6px',
                            border: '1px solid',
                            borderColor: 'primary.main',
                            color: 'primary.main',
                            '&:hover': {
                                backgroundColor: 'primary.main',
                                color: 'primary.contrastText'
                            }
                        }}
                    >
                        <EditIcon sx={{ fontSize: viewMode === 'mini' ? '0.9rem' : '1rem' }} />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Clone">
                    <IconButton
                        size="small"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClone(e, payload);
                        }}
                        sx={{
                            padding: viewMode === 'mini' ? '4px' : '6px',
                            border: '1px solid',
                            borderColor: 'secondary.main',
                            color: 'secondary.main',
                            '&:hover': {
                                backgroundColor: 'secondary.main',
                                color: 'secondary.contrastText'
                            }
                        }}
                    >
                        <ContentCopyIcon sx={{ fontSize: viewMode === 'mini' ? '0.9rem' : '1rem' }} />
                    </IconButton>
                </Tooltip>
                <Tooltip title={isInUse ? "Cannot delete - layout is in use" : "Delete"}>
                    <span>
                        <IconButton
                            size="small"
                            disabled={isInUse}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!isInUse) {
                                    onDelete(e, payload.id);
                                }
                            }}
                            sx={{
                                padding: viewMode === 'mini' ? '4px' : '6px',
                                border: '1px solid',
                                borderColor: 'error.main',
                                color: 'error.main',
                                '&:hover': {
                                    backgroundColor: 'error.main',
                                    color: 'error.contrastText'
                                }
                            }}
                        >
                            <DeleteIcon sx={{ fontSize: viewMode === 'mini' ? '0.9rem' : '1rem' }} />
                        </IconButton>
                    </span>
                </Tooltip>
                {/* In Use Indicator - show next to delete button */}
                {isInUse && (
                    <Tooltip
                        title={
                            <Box>
                                {usedByJunctions.length > 0 && (
                                    <>
                                        <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                                            Used by {usedByJunctions.length} junction{usedByJunctions.length > 1 ? 's' : ''}:
                                        </Typography>
                                        {usedByJunctions.map(j => (
                                            <Typography key={j.junctionId} variant="caption" sx={{ display: 'block', ml: 1 }}>
                                                • {j.junctionName}
                                            </Typography>
                                        ))}
                                    </>
                                )}
                                {deviceScreensUsingAsDefault.length > 0 && (
                                    <>
                                        <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mt: usedByJunctions.length > 0 ? 1 : 0, mb: 0.5 }}>
                                            Set as default for {deviceScreensUsingAsDefault.length} device screen{deviceScreensUsingAsDefault.length > 1 ? 's' : ''}:
                                        </Typography>
                                        {deviceScreensUsingAsDefault.map(ds => (
                                            <Typography key={`${ds.deviceId}-${ds.screenKey}`} variant="caption" sx={{ display: 'block', ml: 1 }}>
                                                • {ds.deviceName}, {ds.screenDisplayName}
                                            </Typography>
                                        ))}
                                    </>
                                )}
                            </Box>
                        }
                    >
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                            }}
                            sx={{
                                padding: viewMode === 'mini' ? '4px' : '6px',
                                border: '1px solid',
                                borderColor: 'success.main',
                                color: 'success.main',
                                '&:hover': {
                                    backgroundColor: 'success.main',
                                    color: 'success.contrastText'
                                }
                            }}
                        >
                            <AccountTreeIcon sx={{ fontSize: viewMode === 'mini' ? '0.9rem' : '1rem' }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        </Card>
    );
});

// Memoized TableRow component
const PayloadTableRow = memo(({
    payload,
    visibleCols,
    allColumns,
    onDelete,
    onEdit,
    onClone,
    junctions,
    deviceScreenDefaults,
}: {
    payload: LayoutListItem,
    visibleCols: string[],
    allColumns: PayloadColumn[],
    onDelete: (e: React.MouseEvent, id: string) => void,
    onEdit: (e: React.MouseEvent, payload: LayoutListItem) => void,
    onClone: (e: React.MouseEvent, payload: LayoutListItem) => void,
    junctions: Junction[],
    deviceScreenDefaults: DeviceScreenDefault[],
}) => {
    const navigate = useNavigate();

    // Find junctions that use this screen layout
    const usedByJunctions = junctions.filter(junction => {
        return junction.layoutIds.some(layoutIdPair => {
            const layoutId = layoutIdPair.screenLayoutId;
            return layoutId && String(layoutId) === String(payload.id);
        });
    });

    // Find device screens that have this layout as default
    const deviceScreensUsingAsDefault = deviceScreenDefaults.filter(ds => {
        const layoutId = ds.screenLayoutId;
        return layoutId && String(layoutId) === String(payload.id);
    });

    // Check if layout is in use (by junctions or as device screen default)
    const isInUse = usedByJunctions.length > 0 || deviceScreensUsingAsDefault.length > 0;

    const getPayloadCell = useCallback((field: string) => {
        switch (field) {
            case "name":
                const typeInfo = getPayloadTypeInfo(payload.layoutType);
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {typeInfo.icon}
                        <Typography fontWeight="medium" color="text.primary">
                            {payload.displayName}
                        </Typography>
                    </Box>
                );
            case "template":
                return payload.isTemplate ? (
                    <CheckIcon fontSize="small" sx={{ color: "success.main" }} />
                ) : (
                    ""
                );
            case "type":
                const typeInfoChip = getPayloadTypeInfo(payload.layoutType);
                return (
                    <Chip
                        label={payload.layoutType}
                        color={typeInfoChip.color}
                        size="small"
                        sx={{ fontSize: '0.75rem', height: 22 }}
                    />
                );
            case "description":
                return payload.description || "-";
            case "dimensions":
                return payload.rows && payload.columns ? `${payload.rows}×${payload.columns}` : "-";
            case "actions":
                return (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={(e) => onEdit(e, payload)}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Clone">
                            <IconButton
                                size="small"
                                onClick={(e) => onClone(e, payload)}
                            >
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={isInUse ? "Cannot delete - layout is in use" : "Delete"}>
                            <span>
                                <IconButton
                                    size="small"
                                    disabled={isInUse}
                                    onClick={(e) => {
                                        if (!isInUse) {
                                            onDelete(e, payload.id);
                                        }
                                    }}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        {/* In Use Indicator - show next to delete button */}
                        {isInUse && (
                            <Tooltip
                                title={
                                    <Box>
                                        {usedByJunctions.length > 0 && (
                                            <>
                                                <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                                                    Used by {usedByJunctions.length} junction{usedByJunctions.length > 1 ? 's' : ''}:
                                                </Typography>
                                                {usedByJunctions.map(j => (
                                                    <Typography key={j.junctionId} variant="caption" sx={{ display: 'block', ml: 1 }}>
                                                        • {j.junctionName}
                                                    </Typography>
                                                ))}
                                            </>
                                        )}
                                        {deviceScreensUsingAsDefault.length > 0 && (
                                            <>
                                                <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mt: usedByJunctions.length > 0 ? 1 : 0, mb: 0.5 }}>
                                                    Set as default for {deviceScreensUsingAsDefault.length} device screen{deviceScreensUsingAsDefault.length > 1 ? 's' : ''}:
                                                </Typography>
                                                {deviceScreensUsingAsDefault.map(ds => (
                                                    <Typography key={`${ds.deviceId}-${ds.screenKey}`} variant="caption" sx={{ display: 'block', ml: 1 }}>
                                                        • {ds.deviceName}, {ds.screenDisplayName}
                                                    </Typography>
                                                ))}
                                            </>
                                        )}
                                    </Box>
                                }
                            >
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        e.preventDefault();
                                    }}
                                    sx={{
                                        color: 'success.main',
                                        border: '1px solid',
                                        borderColor: 'success.main',
                                        '&:hover': {
                                            backgroundColor: 'success.light',
                                            borderColor: 'success.main'
                                        }
                                    }}
                                >
                                    <AccountTreeIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                );
            default:
                return "-";
        }
    }, [payload, onDelete, onEdit, onClone, isInUse]);

    return (
        <TableRow
            hover
            onClick={() => navigate(`/configure-payload/${payload.id}`)}
            sx={{ cursor: "pointer" }}
        >
            {visibleCols.map((field) => {
                const colDef = allColumns.find((c) => c.field === field);
                if (!colDef) return null;
                
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
                        {getPayloadCell(field)}
                    </TableCell>
                );
            })}
        </TableRow>
    );
});

// AddLayout Modal Component
const AddLayoutModal: React.FC<{
    open: boolean,
    onClose: () => void,
    onLayoutAdded: (newLayoutId?: string, andConfigure?: boolean) => void
}> = ({ open, onClose, onLayoutAdded }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);
    const [layout, setLayout] = useState<NewLayoutForm>(EMPTY_LAYOUT_FORM);
    const [error, setError] = useState<string>("");

    // Layout type options for dropdown
    const layoutTypes = [
        { value: "", name: "Select Layout Type", desc: "Choose a layout type to begin" },
        { value: "LVGL_GRID", name: "LVGL Grid", desc: "Grid-based UI layout" },
        { value: "LVGL_RADIO", name: "LVGL Radio", desc: "Radio button interface" },
        { value: "LVGL_PLOTTER", name: "LVGL Plotter", desc: "Chart and graph display" },
        { value: "QUAD", name: "Quad", desc: "Four-panel layout" },
        { value: "MATRIX", name: "Matrix", desc: "LED matrix display" },
        { value: "NEOPIXEL", name: "NeoPixel", desc: "RGB LED strip control" },
        { value: "CUSTOM", name: "Custom", desc: "Custom layout configuration" }
    ];

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            setLayout(EMPTY_LAYOUT_FORM);
            setError("");
        }
    }, [open]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (name === 'displayName' || name === 'description') {
            setLayout({ ...layout, [name]: value });
        } else if (name === 'rows' || name === 'columns') {
            setLayout({ ...layout, [name]: value === '' ? '' : Number(value) });
        }
    };

    const handleTypeChange = (e: SelectChangeEvent<string>) => {
        setLayout({ ...layout, layoutType: e.target.value });
    };

    // Handle form submission
    const handleAddLayout = async (configureAfter: boolean = false) => {
        setLoading(true);
        setError("");
        setConfigureAfterAdd(configureAfter);

        if (!layout.displayName || !layout.layoutType) {
            setError("Name and Type are required!");
            setLoading(false);
            return;
        }

        try {
            const newLayout = {
                displayName: layout.displayName,
                layoutType: layout.layoutType,
                description: layout.description,
                rows: layout.rows === '' ? null : layout.rows,
                columns: layout.columns === '' ? null : layout.columns
            };

            const response = await fetch("/api/payloads", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newLayout),
            });

            if (response.ok) {
                const result = await response.json();
                onLayoutAdded(result.id, configureAfter);
                onClose();
                return;
            }

            const errorData = await response.json();
            throw new Error(errorData.message || "Error adding layout");
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    // Set default values based on selected layout type
    useEffect(() => {
        if (layout.layoutType === "LVGL_GRID") {
            setLayout((prev) => ({
                ...prev,
                displayName: "LVGL Grid Layout",
                description: "Grid-based UI layout for LVGL displays"
            }));
        } else if (layout.layoutType === "LVGL_RADIO") {
            setLayout((prev) => ({
                ...prev,
                displayName: "LVGL Radio Layout",
                description: "Radio button interface for LVGL displays"
            }));
        } else if (layout.layoutType === "LVGL_PLOTTER") {
            setLayout((prev) => ({
                ...prev,
                displayName: "LVGL Plotter Layout",
                description: "Chart and graph display for LVGL"
            }));
        } else if (layout.layoutType === "QUAD") {
            setLayout((prev) => ({
                ...prev,
                displayName: "Quad Layout",
                description: "Four-panel display layout",
                rows: 2,
                columns: 2
            }));
        } else if (layout.layoutType === "MATRIX") {
            setLayout((prev) => ({
                ...prev,
                displayName: "Matrix Layout",
                description: "LED matrix display configuration",
                rows: 8,
                columns: 8
            }));
        } else if (layout.layoutType === "NEOPIXEL") {
            setLayout((prev) => ({
                ...prev,
                displayName: "NeoPixel Layout",
                description: "RGB LED strip control layout",
                rows: 1,
                columns: 60
            }));
        } else if (layout.layoutType === "CUSTOM") {
            setLayout((prev) => ({
                ...prev,
                displayName: "Custom Layout",
                description: "Custom layout configuration"
            }));
        } else {
            setLayout((prev) => ({
                ...prev,
                displayName: "",
                description: ""
            }));
        }
    }, [layout.layoutType]);

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
                    Add Payload Layout
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
                                Select Layout Type
                            </Typography>
                            {layoutTypes.slice(1).map((layoutType) => (
                                <Box
                                    key={layoutType.value}
                                    onClick={() => setLayout({ ...layout, layoutType: layoutType.value })}
                                    sx={{
                                        p: 2,
                                        mx: 1,
                                        mb: 1,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        bgcolor: layout.layoutType === layoutType.value ? 'primary.main' : 'transparent',
                                        color: layout.layoutType === layoutType.value ? 'primary.contrastText' : 'text.primary',
                                        '&:hover': {
                                            bgcolor: layout.layoutType === layoutType.value ? 'primary.dark' : 'action.hover'
                                        },
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={layout.layoutType === layoutType.value ? 'bold' : 'medium'}>
                                        {layoutType.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        opacity: layout.layoutType === layoutType.value ? 0.9 : 0.7,
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
                                            <InputLabel id="layout-type-label">Layout Type *</InputLabel>
                                            <Select
                                                labelId="layout-type-label"
                                                value={layout.layoutType}
                                                onChange={handleTypeChange}
                                                label="Layout Type *"
                                            >
                                                {layoutTypes.map((type) => (
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
                                    {layout.layoutType && (
                                        <>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Layout Name"
                                                name="displayName"
                                                value={layout.displayName}
                                                onChange={handleChange}
                                                required
                                            />

                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Description"
                                                name="description"
                                                value={layout.description}
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
                                                    value={layout.rows}
                                                    onChange={handleChange}
                                                    inputProps={{ min: 1, max: 100 }}
                                                    sx={{ flex: 1 }}
                                                />
                                                <TextField
                                                    size="small"
                                                    label="Columns"
                                                    name="columns"
                                                    type="number"
                                                    value={layout.columns}
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
                            {layout.layoutType && (
                                <Box sx={{
                                    flex: 1,
                                    p: { xs: 2, md: 3 },
                                    overflowY: 'auto',
                                    bgcolor: 'background.default',
                                    minHeight: { xs: '200px', md: 'auto' }
                                }}>
                                    <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', md: '1.25rem' } }}>
                                        Layout Information
                                    </Typography>
                                    <SetupInstructions_Payloads layoutType={layout.layoutType} />
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
                                    onClick={() => handleAddLayout(false)}
                                    size="small"
                                    startIcon={<AddIcon />}
                                    disabled={loading || !layout.layoutType}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {loading && !configureAfterAdd ? "Adding..." : "Add Payload Layout"}
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddLayout(true)}
                                    size="small"
                                    color="secondary"
                                    startIcon={<EditIcon />}
                                    disabled={loading || !layout.layoutType}
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

// Main Payloads Component
const Payloads = () => {
    usePageTitle('Payloads');

    // Cloud auth (same pattern as Server Collectors page)
    const { isAuthenticated, isLoading, hasValidLicense, user } = useAuth();
    const cloudAuth = useMemo<CloudAuthState>(() => ({
        isAuthenticated,
        loading: isLoading,
        hasValidLicense,
        userName: user?.username ?? null,
        profileImageUrl: null,
    }), [isAuthenticated, isLoading, hasValidLicense, user?.username]);

    // Plugin import pref (default false, only show when explicitly true)
    const [enableImportProtocols, setEnableImportProtocols] = useState(false);

    useEffect(() => {
        fetch('/api/settings/plugin_import_protocols')
            .then(res => res.ok ? res.json() : null)
            .then(data => { if (data) setEnableImportProtocols(data.value === 'true'); })
            .catch(() => {});
    }, []);

    // Active sub-tab — persisted to localStorage
    const [activeSubTab, setActiveSubTab] = useState<number>(() => {
        const saved = localStorage.getItem(STORAGE_KEY_PAYLOADS_ACTIVE_TAB);
        const parsed = saved !== null ? parseInt(saved, 10) : 0;
        return (parsed >= 0 && parsed <= 3) ? parsed : 0;
    });
    const handleSubTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
        setActiveSubTab(newValue);
        localStorage.setItem(STORAGE_KEY_PAYLOADS_ACTIVE_TAB, newValue.toString());
    }, []);

    const [layouts, setLayouts] = useState<LayoutListItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [installedProtocolCount, setInstalledProtocolCount] = useState<number | null>(null);
    const [addLayoutModalOpen, setAddLayoutModalOpen] = useState<boolean>(false);
    const [configurePayloadModalOpen, setConfigurePayloadModalOpen] = useState<boolean>(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");
    const [junctions, setJunctions] = useState<Junction[]>([]);
    const [deviceScreenDefaults, setDeviceScreenDefaults] = useState<DeviceScreenDefault[]>([]);

    // View mode and table management state
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_PAYLOADS_VIEW_MODE);
        return isViewMode(stored) ? stored : 'table';
    });
    
    const [visibleCols, setVisibleCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_PAYLOADS_COLUMNS);
        return stored ? JSON.parse(stored) : defaultVisibleColumns;
    });

    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_PAYLOADS_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'displayName', order: 'asc' };
        } catch (e) {
            return { orderBy: 'displayName', order: 'asc' };
        }
    });

    // Popover anchor for column management
    const [anchorCols, setAnchorCols] = useState<HTMLElement | null>(null);

    // Accordion expansion state — persisted to localStorage, no animation on load
    const [payloadsExpanded, setPayloadsExpanded] = useState<boolean>(() => {
        const s = localStorage.getItem('payloads_table_expanded');
        return s !== null ? JSON.parse(s) : true;
    });

    const navigate = useNavigate();
    const handleCloudLogin = useCallback(() => navigate('/settings'), [navigate]);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // Persist states
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_PAYLOADS_VIEW_MODE, viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_PAYLOADS_COLUMNS, JSON.stringify(visibleCols));
    }, [visibleCols]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_PAYLOADS_SORT, JSON.stringify(sortState));
    }, [sortState]);

    useEffect(() => {
        localStorage.setItem('payloads_table_expanded', JSON.stringify(payloadsExpanded));
    }, [payloadsExpanded]);

    // Show snackbar with configurable severity
    const showSnackbar = (message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    };

    const fetchLayouts = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/payloads");
            if (!response.ok) {
                throw new Error("Failed to fetch layouts");
            }
            const data = await response.json();
            setLayouts(data);
        } catch (err) {
            showSnackbar("Error fetching layouts", "error");
            console.error("Error fetching layouts:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLayouts();
        // Fetch installed protocol count for tab label
        fetch('/api/protocols/types')
            .then(res => res.ok ? res.json() : [])
            .then(data => setInstalledProtocolCount(Array.isArray(data) ? data.length : 0))
            .catch(() => { /* count stays null */ });
    }, []);

    // Fetch layout usage on mount
    useEffect(() => {
        const fetchLayoutUsage = async () => {
            try {
                const response = await fetch('/api/junctions/layout-usage');
                if (response.ok) {
                    const data: LayoutUsageResponse = await response.json();
                    setJunctions(data.junctionUsages);
                    setDeviceScreenDefaults(data.deviceScreenDefaults);
                }
            } catch (error) {
                console.error('Error fetching layout usage:', error);
            }
        };

        fetchLayoutUsage();
    }, []);

    // Listen for view mode changes from bottom action bar (mobile only) 
    useEffect(() => {
        const handleBottomActionViewModeChange = (e: Event) => {
            // Only respond to bottom action bar changes when in mobile mode
            const newMode = viewModeFromEvent(e);
            if (isMobile && newMode) {
                setViewMode(newMode);
                localStorage.setItem(STORAGE_KEY_PAYLOADS_VIEW_MODE, newMode);
            }
        };

        // Listen for localStorage changes from other tabs/windows
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY_PAYLOADS_VIEW_MODE && isViewMode(e.newValue)) {
                setViewMode(e.newValue);
            }
        };

        // Only listen for bottom action events on mobile
        if (isMobile) {
            window.addEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange);
        }

        window.addEventListener('storage', handleStorageChange);

        return () => {
            if (isMobile) {
                window.removeEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange);
            }
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [isMobile]);

    // Listen for bottom action bar events
    useEffect(() => {
        const handleAddLayout = () => {
            setAddLayoutModalOpen(true);
        };

        const handleResetAll = () => {
            handleResetAll();
        };

        // Add event listeners for bottom action bar
        window.addEventListener('bottom-action-add-payload', handleAddLayout);
        window.addEventListener('bottom-action-reset-all', handleResetAll);

        // Cleanup
        return () => {
            window.removeEventListener('bottom-action-add-payload', handleAddLayout);
            window.removeEventListener('bottom-action-reset-all', handleResetAll);
        };
    }, []);

    // Sort layouts
    const sortedLayouts = useMemo(() => {
        const { orderBy, order } = sortState;
        return [...layouts].sort((a, b) => {
            let valueA: string | number;
            let valueB: string | number;

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
                    valueA = '';
                    valueB = '';
            }

            if (valueA < valueB) {
                return order === 'asc' ? -1 : 1;
            }
            if (valueA > valueB) {
                return order === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [layouts, sortState]);

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

    const handleLayoutAdded = (newLayoutId?: string, andConfigure: boolean = false) => {
        if (andConfigure && newLayoutId) {
            navigate(`/configure-payload/${newLayoutId}`);
        } else {
            fetchLayouts();
            showSnackbar("Layout added successfully", "success");
        }
    };


    const handleDelete = async (e: React.MouseEvent, layoutId: string) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this layout?")) return;
        try {
            const response = await fetch(`/api/payloads/${layoutId}`, { method: "DELETE" });
            if (!response.ok) throw new Error("Failed to delete layout");
            await fetchLayouts();
            showSnackbar("Layout deleted successfully", "success");
        } catch (err) {
            showSnackbar("Error deleting layout", "error");
        }
    };

    const handleEdit = (e: React.MouseEvent, layout: LayoutListItem) => {
        e.stopPropagation();
        navigate(`/configure-payload/${layout.id}`);
    };

    const handleClone = async (e: React.MouseEvent, layout: LayoutListItem) => {
        e.stopPropagation();
        try {
            const originalId = parseInt(layout.id, 10);
            const response = await fetch("/api/payloads/clone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ originalId })
            });
            if (!response.ok) throw new Error("Failed to clone layout");
            await fetchLayouts();
            showSnackbar("Layout cloned successfully", "success");
        } catch (err) {
            showSnackbar("Error cloning layout", "error");
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
                    Payload Management
                </Typography>
            )}

            {/* Tab Container */}
            <Paper sx={{ display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
                    <Tabs value={activeSubTab} onChange={handleSubTabChange}>
                        <Tab label={loading ? 'Payloads' : `Payloads (${sortedLayouts.length})`} />
                        <Tab label={installedProtocolCount !== null ? `Installed Protocols (${installedProtocolCount})` : 'Installed Protocols'} />
                        {/* MVP v1: ProtocolXchange and My Uploads hidden */}
                        <Tab label="ProtocolXchange" sx={{ display: 'none' }} />
                        <Tab label="My Uploads" sx={{ display: 'none' }} />
                    </Tabs>
                </Box>
                <Box>
                    {activeSubTab === 0 && (
                        <>
                            {/* Payloads Accordion — all controls in header */}
                            <Accordion
                                expanded={payloadsExpanded}
                                onChange={() => setPayloadsExpanded(!payloadsExpanded)}
                                square
                                TransitionProps={{ timeout: payloadsExpanded ? undefined : 0 }}
                            >
                                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ pr: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                                            Configured Payloads ({loading ? '...' : sortedLayouts.length})
                                        </Typography>
                                        {!isMobile && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                                                {/* Configure Payload button */}
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfigurePayloadModalOpen(true);
                                                    }}
                                                    size="small"
                                                    startIcon={<AddIcon />}
                                                >
                                                    Configure Payload
                                                </Button>

                                                {/* 2. Column picker gear — table mode only */}
                                                {viewMode === 'table' && (
                                                    <IconButton size="small" onClick={openColsPopover}>
                                                        <SettingsIcon fontSize="small" />
                                                    </IconButton>
                                                )}

                                                {/* 3. View mode toggle — icon-only */}
                                                <ToggleButtonGroup
                                                    value={viewMode}
                                                    exclusive
                                                    onChange={handleViewModeChange}
                                                    aria-label="view mode"
                                                    size="small"
                                                >
                                                    <ToggleButton value="table" title="Table View">
                                                        <TableViewIcon fontSize="small" />
                                                    </ToggleButton>
                                                    <ToggleButton value="standard" title="Card View">
                                                        <DashboardIcon fontSize="small" />
                                                    </ToggleButton>
                                                    <ToggleButton value="mini" title="Compact View">
                                                        <ViewModuleIcon fontSize="small" />
                                                    </ToggleButton>
                                                </ToggleButtonGroup>
                                            </Box>
                                        )}
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails sx={{ p: 0 }}>
                                    {loading ? (
                                        <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                                            <CircularProgress size={24} />
                                        </Box>
                                    ) : (
                                        <>
                                            {viewMode === 'table' ? (
                /* Table View */
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: 'action.hover' }}>
                                {visibleCols.map((field) => {
                                    const colDef = defaultPayloadColumns.find((c) => c.field === field);
                                    if (!colDef) return null;

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
                            {sortedLayouts.length > 0 ? (
                                sortedLayouts.map((layout) => (
                                    <PayloadTableRow
                                        key={layout.id}
                                        payload={layout}
                                        visibleCols={visibleCols}
                                        allColumns={defaultPayloadColumns}
                                        onDelete={handleDelete}
                                        onEdit={handleEdit}
                                        onClone={handleClone}
                                        junctions={junctions}
                                        deviceScreenDefaults={deviceScreenDefaults}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={visibleCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">No payloads found</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : (
                /* Tile Views */
                <Box sx={{ p: 2 }}>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: getGridColumns(),
                        gap: 0.75,
                    }}>
                        {sortedLayouts.length > 0 ? (
                            sortedLayouts.map((layout) => (
                                <PayloadCard
                                    key={layout.id}
                                    payload={layout}
                                    viewMode={viewMode === 'mini' ? 'mini' : 'standard'}
                                    onDelete={handleDelete}
                                    onEdit={handleEdit}
                                    onClone={handleClone}
                                    junctions={junctions}
                                    deviceScreenDefaults={deviceScreenDefaults}
                                />
                            ))
                        ) : (
                            <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                                <Typography color="textSecondary">No payloads found</Typography>
                            </Paper>
                        )}
                    </Box>
                </Box>
                                            )}
                                        </>
                                    )}
                                </AccordionDetails>
                            </Accordion>
                        </>
                    )}
                    {activeSubTab === 1 && (
                        <FrameEngine_ProtocolPluginsTab
                          onShowSnackbar={showSnackbar}
                          enableImport={enableImportProtocols}
                        />
                    )}
                    {activeSubTab === 2 && (
                        <FrameEngine_CloudProtocolsTab
                          cloudAuth={cloudAuth}
                          onCloudLogin={handleCloudLogin}
                          cloudLoginLabel="Go to Settings"
                          onShowSnackbar={showSnackbar}
                        />
                    )}
                    {activeSubTab === 3 && (
                        <FrameEngine_MyProtocolUploadsTab
                          cloudAuth={cloudAuth}
                          onCloudLogin={handleCloudLogin}
                          cloudLoginLabel="Go to Settings"
                        />
                    )}
                </Box>
            </Paper>

            {/* Column picker popover — rendered outside accordion */}
            <Popover
                open={Boolean(anchorCols)}
                anchorEl={anchorCols}
                onClose={closeColsPopover}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Box sx={{ p: 2, minWidth: 200 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Columns</Typography>
                    <Divider sx={{ mb: 1 }} />
                    {visibleCols.map((field, idx) => (
                        <Box key={field} sx={{ display: 'flex', alignItems: 'center' }}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked
                                        onChange={(e) => handleToggleColumn(field, e.target.checked)}
                                        size="small"
                                    />
                                }
                                label={<Typography variant="body2">{defaultPayloadColumns.find((c) => c.field === field)?.label ?? field}</Typography>}
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
                                disabled={idx === visibleCols.length - 1}
                            >
                                <ArrowDownwardIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    ))}
                    {defaultPayloadColumns
                        .filter((c) => !visibleCols.includes(c.field))
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

            {/* Add Payload Layout Modal */}
            <AddLayoutModal
                open={addLayoutModalOpen}
                onClose={() => setAddLayoutModalOpen(false)}
                onLayoutAdded={handleLayoutAdded}
            />

            {/* Configure Payload Modal */}
            <Payloads_ConfigurePayloadModal
                open={configurePayloadModalOpen}
                onClose={() => setConfigurePayloadModalOpen(false)}
                onPayloadConfigured={(config) => {
                    showSnackbar(`Payload "${config.name}" configured with ${config.protocolName}`, "success");
                }}
                onPayloadConfiguredAndEdit={(config) => {
                    showSnackbar(`Payload "${config.name}" configured. Redirecting to configuration...`, "success");
                }}
            />
        </Box>
    );
};

export default Payloads;