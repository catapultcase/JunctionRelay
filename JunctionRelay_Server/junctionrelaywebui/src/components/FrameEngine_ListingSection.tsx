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

import React, { useState, useCallback, memo, useMemo, useEffect } from 'react';
import {
    Box,
    Typography,
    Button,
    CircularProgress,
    ToggleButtonGroup,
    ToggleButton,
    Popover,
    List,
    ListItem,
    ListItemText,
    Checkbox,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    Paper,
    Chip,
    Tooltip,
    Card,
    CardContent,
    Divider,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
    TableView as TableViewIcon,
    ViewModule as ViewModuleIcon,
    Dashboard as DashboardIcon,
    PhotoLibrary as PhotoLibraryIcon,
    ArrowUpward as ArrowUpwardIcon,
    ArrowDownward as ArrowDownwardIcon,
    Edit as EditIcon,
    ContentCopy as ContentCopyIcon,
    Delete as DeleteIcon,
    Check as CheckIcon,
    Image as ImageIcon,
    Photo as PhotoIcon,
    CalendarToday as CalendarTodayIcon,
    GridOn as GridOnIcon,
    ShowChart as ShowChartIcon,
    Apps as AppsIcon,
    Extension as ExtensionIcon,
    CloudUpload as CloudUploadIcon,
    AccountTree as AccountTreeIcon,
} from '@mui/icons-material';
import FrameEngine_Gallery from './FrameEngine_Gallery';
import FrameEngine_CloudVersionsModal from './FrameEngine_CloudVersionsModal';

// Types
type ViewMode = 'gallery' | 'table';
type SortDirection = 'asc' | 'desc';

interface FrameLayoutListItem {
    id: string;
    isTemplate?: boolean;
    displayName: string;
    description?: string;
    layoutType: string;
    width?: number;
    height?: number;
    hasThumbnail?: boolean;
    thumbnailPath?: string;
    thumbnailGeneratedAt?: string;
    cloudSnapshotCount?: number;
}

interface FrameEngineColumn {
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

interface FrameEngineListingSectionProps {
    frameLayouts: FrameLayoutListItem[];
    loading: boolean;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    visibleColumns: string[];
    onVisibleColumnsChange: (columns: string[]) => void;
    sortState: { orderBy: string; order: SortDirection };
    onSortChange: (orderBy: string, order: SortDirection) => void;
    onDelete: (e: React.MouseEvent, id: string) => void;
    onEdit: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void;
    onClone: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void;
    onShowSnackbar?: (message: string, severity?: "success" | "info" | "warning" | "error") => void;
    isMobile?: boolean;
    hasProLicense?: boolean;
}

// Column definitions
const defaultFrameEngineColumns: FrameEngineColumn[] = [
    { field: "actions", label: "Actions", align: "right", sortable: false },
    { field: "name", label: "Name", align: "left", sortable: true },
    { field: "template", label: "Template", align: "center", sortable: true },
    { field: "type", label: "Type", align: "left", sortable: true },
    { field: "description", label: "Description", align: "left", sortable: true },
    { field: "dimensions", label: "Dimensions", align: "center", sortable: false },
    { field: "thumbnail", label: "Thumbnail", align: "center", sortable: true },
    { field: "cloudSnapshots", label: "Cloud Snapshots", align: "center", sortable: true },
];

// Helper function to get frame layout type info
const getFrameLayoutTypeInfo = (type: string) => {
    const typeMap: Record<string, { color: "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error", icon: React.ReactNode }> = {
        "PRE_RENDERED_IMAGE": { color: "primary", icon: <ImageIcon fontSize="small" /> },
        "COMPOSITE_MODE": { color: "secondary", icon: <ExtensionIcon fontSize="small" /> },
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

// Memoized TableRow component
const FrameLayoutTableRow = memo(({
    frameLayout,
    visibleCols,
    allColumns,
    onDelete,
    onEdit,
    onClone,
    hasProLicense,
    onShowSnackbar,
    junctions,
    deviceScreenDefaults,
}: {
    frameLayout: FrameLayoutListItem,
    visibleCols: string[],
    allColumns: FrameEngineColumn[],
    onDelete: (e: React.MouseEvent, id: string) => void,
    onEdit: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void,
    onClone: (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => void,
    hasProLicense?: boolean,
    onShowSnackbar?: (message: string, severity?: "success" | "info" | "warning" | "error") => void,
    junctions: Junction[],
    deviceScreenDefaults: DeviceScreenDefault[],
}) => {
    const navigate = useNavigate();
    const [cloudVersionsModalOpen, setCloudVersionsModalOpen] = React.useState(false);

    // Find junctions that use this frame layout
    const usedByJunctions = junctions.filter(junction => {
        return junction.layoutIds.some(layoutIdPair => {
            const layoutId = layoutIdPair.frameLayoutId;
            return layoutId && String(layoutId) === String(frameLayout.id);
        });
    });

    // Find device screens that have this layout as default
    const deviceScreensUsingAsDefault = deviceScreenDefaults.filter(ds => {
        const layoutId = ds.frameLayoutId;
        return layoutId && String(layoutId) === String(frameLayout.id);
    });

    // Check if layout is in use (by junctions or as device screen default)
    const isInUse = usedByJunctions.length > 0 || deviceScreensUsingAsDefault.length > 0;

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
                return frameLayout.width && frameLayout.height
                    ? `${frameLayout.width}×${frameLayout.height}`
                    : "-";
            case "thumbnail":
                return frameLayout.hasThumbnail ? (
                    <Chip
                        icon={<ImageIcon />}
                        label="Available"
                        color="success"
                        size="small"
                        sx={{ fontSize: '0.7rem', height: 20 }}
                    />
                ) : (
                    <Chip
                        label="None"
                        color="default"
                        size="small"
                        sx={{ fontSize: '0.7rem', height: 20 }}
                    />
                );
            case "cloudSnapshots":
                const count = frameLayout.cloudSnapshotCount || 0;
                return count > 0 ? (
                    <Chip
                        icon={<CloudUploadIcon />}
                        label={count.toString()}
                        color="info"
                        size="small"
                        sx={{ fontSize: '0.75rem', height: 22 }}
                    />
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        -
                    </Typography>
                );
            case "actions":
                return (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={(e) => onEdit(e, frameLayout)}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Clone">
                            <IconButton
                                size="small"
                                onClick={(e) => onClone(e, frameLayout)}
                            >
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        {!frameLayout.isTemplate && (
                            <Tooltip title="Cloud Versions (Pro)">
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setCloudVersionsModalOpen(true);
                                    }}
                                >
                                    <CloudUploadIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip title={isInUse ? "Cannot delete - layout is in use" : "Delete"}>
                            <span>
                                <IconButton
                                    size="small"
                                    disabled={isInUse}
                                    onClick={(e) => {
                                        if (!isInUse) {
                                            onDelete(e, frameLayout.id);
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
                return frameLayout[field as keyof FrameLayoutListItem] || "-";
        }
    }, [frameLayout, onDelete, onEdit, onClone, isInUse, usedByJunctions, deviceScreensUsingAsDefault]);

    return (
        <>
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
                        case "thumbnail":
                            return { minWidth: 100, width: 100 };
                        case "cloudSnapshots":
                            return { minWidth: 130, width: 130 };
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
    
        <FrameEngine_CloudVersionsModal
            open={cloudVersionsModalOpen}
            onClose={() => setCloudVersionsModalOpen(false)}
            templateId={parseInt(frameLayout.id, 10)}
            templateName={frameLayout.displayName}
            hasProLicense={hasProLicense || false}
            onShowSnackbar={onShowSnackbar}
        />
        </>
    );
});

// Main Listing Section Component
const FrameEngineListingSection: React.FC<FrameEngineListingSectionProps> = ({
    frameLayouts,
    loading,
    viewMode,
    onViewModeChange,
    visibleColumns,
    onVisibleColumnsChange,
    sortState,
    onSortChange,
    onDelete,
    onEdit,
    onClone,
    onShowSnackbar,
    isMobile = false,
    hasProLicense = false
}) => {
    const [anchorCols, setAnchorCols] = useState<HTMLElement | null>(null);
    const [junctions, setJunctions] = useState<Junction[]>([]);
    const [deviceScreenDefaults, setDeviceScreenDefaults] = useState<DeviceScreenDefault[]>([]);

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
                case 'thumbnail':
                case 'hasThumbnail':
                    valueA = a.hasThumbnail ? 1 : 0;
                    valueB = b.hasThumbnail ? 1 : 0;
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


    const handleViewModeChange = useCallback((event: React.MouseEvent<HTMLElement>, newViewMode: ViewMode) => {
        if (newViewMode !== null) {
            onViewModeChange(newViewMode);
        }
    }, [onViewModeChange]);

    const handleRequestSort = useCallback((property: string) => {
        const isAsc = sortState.orderBy === property && sortState.order === 'asc';
        onSortChange(property, isAsc ? 'desc' : 'asc');
    }, [sortState, onSortChange]);

    const openColsPopover = useCallback((e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        setAnchorCols(e.currentTarget);
    }, []);

    const closeColsPopover = useCallback(() => setAnchorCols(null), []);

    const handleToggleColumn = useCallback((field: string, checked: boolean) => {
        if (checked) {
            onVisibleColumnsChange([...visibleColumns, field]);
        } else {
            onVisibleColumnsChange(visibleColumns.filter(f => f !== field));
        }
    }, [visibleColumns, onVisibleColumnsChange]);

    const handleMoveColumn = useCallback((field: string, direction: "up" | "down") => {
        const list = visibleColumns;
        const i = list.indexOf(field);
        if (i < 0) return;
        const j = direction === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        const copy = [...list];
        copy.splice(i, 1);
        copy.splice(j, 0, field);
        onVisibleColumnsChange(copy);
    }, [visibleColumns, onVisibleColumnsChange]);

    return (
        <Box>
            {/* Header with view mode toggle and column selector */}
            <Box display="flex" alignItems="center" mb={1} flexWrap="wrap" gap={2}>
                <Typography variant="h6">FrameEngine</Typography>

                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    {/* View Mode Toggle - ONLY show on desktop */}
                    {!isMobile && (
                        <ToggleButtonGroup
                            value={viewMode}
                            exclusive
                            onChange={handleViewModeChange}
                            aria-label="view mode"
                            size="small"
                        >
                            <ToggleButton value="gallery" aria-label="gallery view">
                                <PhotoLibraryIcon />
                                <Typography variant="caption" sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>
                                    Gallery
                                </Typography>
                            </ToggleButton>
                            <ToggleButton value="table" aria-label="table view">
                                <TableViewIcon />
                                <Typography variant="caption" sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>
                                    Table
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
                        {visibleColumns.map((field, idx) => (
                            <ListItem key={field}>
                                <Checkbox
                                    checked
                                    onChange={(e) => handleToggleColumn(field, e.target.checked)}
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
                                    disabled={idx === visibleColumns.length - 1}
                                    onClick={() => handleMoveColumn(field, "down")}
                                >
                                    <ArrowDownwardIcon fontSize="inherit" />
                                </IconButton>
                            </ListItem>
                        ))}
                        {defaultFrameEngineColumns
                            .filter((c) => !visibleColumns.includes(c.field))
                            .map(({ field, label }) => (
                                <ListItem key={field}>
                                    <Checkbox
                                        onChange={(e) => handleToggleColumn(field, e.target.checked)}
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
            ) : viewMode === 'gallery' ? (
                <FrameEngine_Gallery
                    frameLayouts={sortedFrameLayouts}
                    onDelete={onDelete}
                    onEdit={onEdit}
                    onClone={onClone}
                    onShowSnackbar={onShowSnackbar}
                    hasProLicense={hasProLicense}
                />
            ) : viewMode === 'table' ? (
                <TableContainer component={Paper} sx={{ mb: 4 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                {visibleColumns.map((field) => {
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
                                            case "thumbnail":
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
                                        visibleCols={visibleColumns}
                                        allColumns={defaultFrameEngineColumns}
                                        onDelete={onDelete}
                                        onEdit={onEdit}
                                        onClone={onClone}
                                        hasProLicense={hasProLicense}
                                        onShowSnackbar={onShowSnackbar}
                                        junctions={junctions}
                                        deviceScreenDefaults={deviceScreenDefaults}
                                    />
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={visibleColumns.length} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">No frame layouts found</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : null}
        </Box>
    );
};

export default FrameEngineListingSection;