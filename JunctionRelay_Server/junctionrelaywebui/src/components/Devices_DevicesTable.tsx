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
    ToggleButtonGroup,
    ToggleButton,
    Card,
    CardContent,
    Divider,
} from "@mui/material";
import UpdateIcon from '@mui/icons-material/Update';
import WarningIcon from '@mui/icons-material/Warning';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import SignalWifiOffIcon from '@mui/icons-material/SignalWifiOff';
import Cast from "@mui/icons-material/Cast";
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import MemoryIcon from '@mui/icons-material/Memory';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import CloudIcon from '@mui/icons-material/Cloud';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import NotificationsIcon from '@mui/icons-material/Notifications';
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff';
import ArrowRight from '@mui/icons-material/KeyboardArrowRight';
import CheckIcon from '@mui/icons-material/Check';
import SyncIcon from '@mui/icons-material/Sync';
import {
    DeviceColumn,
    SortDirection,
    STORAGE_KEY_DEVICES_COLUMNS,
    STORAGE_KEY_DEVICES_SORT,
    defaultDeviceColumns,
    defaultLocalDeviceColumns,
    defaultCloudDeviceColumns,
    getHeartbeatStatusInfo,
    formatRelativeTime,
    getDeviceStatusInfo,
    getEnhancedConnModeDisplay,
    getDeviceTypeInfo,
    getNotificationsStatusInfo,
    getSyncModeInfo
} from './Devices_Helpers';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useTheme, useMediaQuery } from "@mui/material";

// Storage key for view mode
const STORAGE_KEY_VIEW_MODE = "junctionrelay_devices_view_mode";

// View mode type
type ViewMode = 'table' | 'standard' | 'mini';

// Interface for hierarchical device structure
interface HierarchicalDevice {
    device: any;
    children: HierarchicalDevice[];
    level: number;
}

// Memoized Device Card component for tile views
const DeviceCard = memo(({
    hierarchicalDevice,
    viewMode,
    onDelete,
    onUpdate,
    navigate,
    updateStatuses,
    updatingDevices,
    onNestUnderGateway,
    onToggleNotifications,
    onSyncModeChange,
    notificationLoading,
    isScanResults,
    onResync,
    resyncingDevices,
    resyncedDevices,
    loadingDetails,
    deviceDetails,
    handleCardClick
}: {
    hierarchicalDevice: HierarchicalDevice,
    viewMode: 'standard' | 'mini',
    onDelete: (e: React.MouseEvent, id: number) => void,
    onUpdate: (id: number, e: React.MouseEvent) => void,
    navigate: any,
    updateStatuses: Record<number, boolean>,
    updatingDevices: Set<number>,
    onNestUnderGateway: (deviceId: number) => void,
    onToggleNotifications: (deviceId: number) => void,
    onSyncModeChange: (deviceId: number, mode: string) => void,
    notificationLoading: Set<number>,
    isScanResults?: boolean,
    onResync?: (macAddress: string, ipAddress: string) => void,
    resyncingDevices?: { [macIp: string]: boolean },
    resyncedDevices?: Set<string>,
    loadingDetails?: Set<string>,
    deviceDetails?: Record<string, any>,
    handleCardClick?: (device: any) => void
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

    // Cloud sync mode submenu state
    const [syncModeAnchorEl, setSyncModeAnchorEl] = useState<null | HTMLElement>(null);

    const handleContextMenu = useCallback((event: React.MouseEvent) => {
        if (isScanResults) return;
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
    }, [contextMenu, isScanResults]);

    const handleCloseContextMenu = useCallback(() => {
        setContextMenu(null);
        setSyncModeAnchorEl(null);
    }, []);

    const handleNestUnderGateway = useCallback(() => {
        onNestUnderGateway(device.id);
        handleCloseContextMenu();
    }, [device.id, onNestUnderGateway, handleCloseContextMenu]);

    const handleToggleNotifications = useCallback(() => {
        onToggleNotifications(device.id);
        handleCloseContextMenu();
    }, [device.id, onToggleNotifications, handleCloseContextMenu]);

    const handleSyncModeClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        setSyncModeAnchorEl(event.currentTarget);
    }, []);

    const handleCloseSyncModeMenu = useCallback(() => {
        setSyncModeAnchorEl(null);
    }, []);

    const handleSyncModeSelect = useCallback((mode: string) => {
        onSyncModeChange(device.id, mode);
        setSyncModeAnchorEl(null);
        handleCloseContextMenu();
    }, [device.id, onSyncModeChange, handleCloseContextMenu]);

    // Check if device is being resynced (for scan results)
    const isResyncing = useCallback((macAddress: string, ipAddress: string) => {
        return !!(resyncingDevices && resyncingDevices[`${macAddress}-${ipAddress}`]);
    }, [resyncingDevices]);

    const getCardHeight = () => {
        return viewMode === 'mini' ? 120 : 220;
    };

    const statusInfo = getDeviceStatusInfo(device.status);
    const connModeDisplay = getEnhancedConnModeDisplay(device);
    const heartbeatInfo = getHeartbeatStatusInfo(device, device.heartbeatEnabled);

    // Get device details for scan results
    const details = isScanResults && deviceDetails ? deviceDetails[device.ipAddress] || {} : {};
    const isLoadingDetails = isScanResults && loadingDetails ? loadingDetails.has(device.ipAddress) : false;

    const renderCard = (deviceData: any, deviceLevel: number) => (
        <Card
            key={deviceData.id || deviceData.ipAddress}
            variant="outlined"
            sx={{
                cursor: isScanResults ? 'default' : 'pointer',
                transition: 'all 0.2s ease-in-out',
                position: 'relative',
                minHeight: getCardHeight(),
                display: 'flex',
                flexDirection: 'column',
                marginLeft: deviceLevel > 0 ? 2 : 0,
                marginTop: deviceLevel > 0 ? 1 : 0,
                '&:hover': {
                    boxShadow: 6,
                    transform: isScanResults ? 'none' : 'translateY(-2px)',
                    backgroundColor: 'action.hover'
                },
                border: isGateway ? '2px solid' : '1px solid',
                borderColor: isGateway ? 'primary.main' :
                    deviceData.status === 'Active' || deviceData.status === 'NEW_DEVICE' ? 'success.main' : 'divider',
                backgroundColor: isChild ? 'rgba(0, 0, 0, 0.02)' : 'inherit'
            }}
            onClick={isScanResults ? (handleCardClick ? () => handleCardClick(deviceData) : undefined) : () => navigate(`/configure-device/${deviceData.id}`)}
            onContextMenu={handleContextMenu}
        >
            {/* Status Badge */}
            <Box
                sx={{
                    position: 'absolute',
                    top: viewMode === 'mini' ? 4 : 8,
                    right: viewMode === 'mini' ? 4 : 8,
                    backgroundColor: statusInfo.color === 'success' ? 'success.main' :
                        statusInfo.color === 'warning' ? 'warning.main' :
                            statusInfo.color === 'info' ? 'info.main' : 'grey.400',
                    color: statusInfo.color === 'success' ? 'success.contrastText' :
                        statusInfo.color === 'warning' ? 'warning.contrastText' :
                            statusInfo.color === 'info' ? 'info.contrastText' : 'grey.700',
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
                    ? (statusInfo.color === 'success' ? '●' :
                        statusInfo.color === 'info' ? '◆' :
                            statusInfo.color === 'warning' ? '▲' : '○')
                    : statusInfo.label
                }
            </Box>

            <CardContent sx={{
                flex: 1,
                pt: viewMode === 'mini' ? 2.5 : 5,
                p: viewMode === 'mini' ? 1 : 2
            }}>
                {/* Device Name with hierarchy indicators */}
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: viewMode === 'mini' ? 0.5 : 1,
                    gap: 0.5
                }}>
                    {/* Visual hierarchy indicator for child devices */}
                    {isChild && (
                        <SubdirectoryArrowRightIcon
                            fontSize="small"
                            color="disabled"
                            sx={{ mr: 0.5 }}
                        />
                    )}

                    {/* Device type icons */}
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
                        variant={viewMode === 'mini' ? 'body2' : 'h6'}
                        sx={{
                            fontSize: viewMode === 'mini' ? '0.75rem' : { xs: '1rem', sm: '1.1rem' },
                            fontWeight: 600,
                            lineHeight: viewMode === 'mini' ? 1.2 : 1.5,
                            flex: 1
                        }}
                        noWrap
                    >
                        {isScanResults ? (deviceData.instance || deviceData.name || 'Unknown Device') : deviceData.name}
                    </Typography>
                </Box>

                {/* Device Details */}
                {viewMode === 'standard' && (
                    <>
                        <Divider sx={{ mb: 1 }} />
                        <Box sx={{ mb: 1 }}>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Type:</strong> {deviceData.type || "Unknown"}
                            </Typography>
                            {deviceData.ipAddress && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>IP:</strong> {deviceData.ipAddress}
                                </Typography>
                            )}
                            {isScanResults && deviceData.macAddress && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>MAC:</strong> {deviceData.macAddress}
                                </Typography>
                            )}
                            {isScanResults && details.deviceModel && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Model:</strong> {details.deviceModel}
                                </Typography>
                            )}
                            {isScanResults && details.firmwareVersion && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Firmware:</strong> {details.firmwareVersion}
                                </Typography>
                            )}
                            {!isScanResults && deviceData.deviceModel && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Model:</strong> {deviceData.deviceModel}
                                </Typography>
                            )}
                            {!isScanResults && deviceData.firmwareVersion && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Firmware:</strong> {deviceData.firmwareVersion}
                                </Typography>
                            )}
                        </Box>

                        {/* Loading indicator for scan results */}
                        {isScanResults && isLoadingDetails && (
                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                                <CircularProgress size={12} sx={{ mr: 1 }} />
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.75rem' }}>
                                    Loading details...
                                </Typography>
                            </Box>
                        )}
                    </>
                )}

                {/* Status Chips */}
                <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: viewMode === 'mini' ? 0.5 : 1,
                    mt: 'auto'
                }}>
                    {/* Notifications Status - Only for non-scan results */}
                    {!isScanResults && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {getNotificationsStatusInfo(deviceData).enabled ? (
                                <NotificationsIcon
                                    fontSize="small"
                                    color="success"
                                    sx={{ opacity: 0.8 }}
                                />
                            ) : (
                                <NotificationsOffIcon
                                    fontSize="small"
                                    color="disabled"
                                    sx={{ opacity: 0.6 }}
                                />
                            )}
                            {viewMode === 'standard' && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                    {getNotificationsStatusInfo(deviceData).enabled ? 'Notifications On' : 'Notifications Off'}
                                </Typography>
                            )}
                        </Box>
                    )}

                    {/* Connection Mode - Only show for non-cloud devices and non-scan results */}
                    {!isCloudDevice && !isScanResults && (
                        <Box sx={{
                            display: 'flex',
                            gap: 0.5,
                            flexWrap: 'wrap',
                            alignItems: 'center'
                        }}>
                            {connModeDisplay.map((conn, index) => (
                                <Chip
                                    key={index}
                                    label={viewMode === 'mini'
                                        ? conn.label.substring(0, 8) + (conn.label.length > 8 ? '...' : '')
                                        : conn.label
                                    }
                                    color={conn.color}
                                    size="small"
                                    sx={{
                                        fontSize: viewMode === 'mini' ? '0.6rem' : '0.7rem',
                                        height: viewMode === 'mini' ? 18 : 22
                                    }}
                                />
                            ))}
                        </Box>
                    )}

                    {/* Health/Heartbeat Status - Only for non-scan results */}
                    {!isScanResults && (device.heartbeatEnabled || isCloudDevice) && (
                        <Chip
                            label={viewMode === 'mini'
                                ? `Health: ${heartbeatInfo.label.substring(0, 11)}`
                                : `Health: ${heartbeatInfo.label}`
                            }
                            color={heartbeatInfo.color}
                            size="small"
                            sx={{
                                fontSize: viewMode === 'mini' ? '0.6rem' : '0.7rem',
                                height: viewMode === 'mini' ? 20 : 'auto'
                            }}
                        />
                    )}

                    {!isScanResults && device.lastPinged && (
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                                fontSize: viewMode === 'mini' ? '0.6rem' : '0.65rem',
                                lineHeight: 1.2
                            }}
                        >
                            {viewMode === 'mini'
                                ? `${formatRelativeTime(device.lastPinged)} • ${device.lastPingDurationMs ?? '—'}ms`
                                : `Last: ${formatRelativeTime(device.lastPinged)} (${device.lastPingDurationMs ?? '—'}ms)`}
                        </Typography>
                    )}


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
                        {/* Resync button for scan results */}
                        {isScanResults && deviceData.status === "DEVICE_EXISTS" && onResync &&
                            resyncedDevices && !resyncedDevices.has(deviceData.macAddress) && (
                                <Tooltip title="Resync Device">
                                    <IconButton
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onResync(
                                                deviceData.macAddress || deviceData.MacAddress,
                                                deviceData.ipAddress || deviceData.IpAddress
                                            );
                                        }}
                                        disabled={isResyncing(deviceData.macAddress, deviceData.ipAddress)}
                                    >
                                        {isResyncing(deviceData.macAddress, deviceData.ipAddress) ? (
                                            <CircularProgress size={16} />
                                        ) : (
                                            <SyncIcon fontSize="small" />
                                        )}
                                    </IconButton>
                                </Tooltip>
                            )}

                        {/* Update button for non-scan results */}
                        {!isScanResults && updateStatuses[deviceData.id] === true && (
                            <Tooltip title="Update Firmware">
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdate(deviceData.id, e);
                                    }}
                                    disabled={updatingDevices.has(deviceData.id)}
                                >
                                    {updatingDevices.has(deviceData.id) ? (
                                        <CircularProgress size={16} />
                                    ) : (
                                        <UpdateIcon fontSize="small" />
                                    )}
                                </IconButton>
                            </Tooltip>
                        )}

                        {/* Delete button - only for non-scan results */}
                        {!isScanResults && (
                            <Tooltip title="Delete">
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(e, deviceData.id);
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

    const cards = [];

    // Main device card
    cards.push(renderCard(device, level));

    // Child cards - only for non-scan results
    if (!isScanResults && hasChildren) {
        children.forEach(childHierarchy => {
            cards.push(
                <DeviceCard
                    key={childHierarchy.device.id}
                    hierarchicalDevice={childHierarchy}
                    viewMode={viewMode}
                    onDelete={onDelete}
                    onUpdate={onUpdate}
                    navigate={navigate}
                    updateStatuses={updateStatuses}
                    updatingDevices={updatingDevices}
                    onNestUnderGateway={onNestUnderGateway}
                    onToggleNotifications={onToggleNotifications}
                    onSyncModeChange={onSyncModeChange}
                    notificationLoading={notificationLoading}
                    isScanResults={isScanResults}
                    onResync={onResync}
                    resyncingDevices={resyncingDevices}
                    resyncedDevices={resyncedDevices}
                    loadingDetails={loadingDetails}
                    deviceDetails={deviceDetails}
                />
            );
        });
    }

    return (
        <>
            {cards}

            {/* Context Menu - Only for non-scan results */}
            {!isScanResults && (
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
                            onNestUnderGateway(device.id);
                            handleCloseContextMenu();
                        }}>
                            <LinkOffIcon sx={{ mr: 1 }} />
                            Remove from Gateway
                        </MenuItem>
                    )}

                    {/* Notification toggle option - now handles both enable and disable */}
                    <MenuItem
                        onClick={handleToggleNotifications}
                        disabled={notificationLoading.has(device.id)}
                    >
                        {device.pushNotifications ? (
                            <>
                                <NotificationsOffIcon sx={{ mr: 1 }} />
                                {notificationLoading.has(device.id) ? 'Disabling...' : 'Disable Notifications'}
                            </>
                        ) : (
                            <>
                                <NotificationsIcon sx={{ mr: 1 }} />
                                {notificationLoading.has(device.id) ? 'Enabling...' : 'Enable Notifications'}
                            </>
                        )}
                    </MenuItem>

                    {/* Cloud Sync Mode submenu - Only show for non-cloud devices */}
                    {!isCloudDevice && (
                        <MenuItem onClick={handleSyncModeClick}>
                            <CloudIcon sx={{ mr: 1 }} />
                            Cloud Sync Mode
                            <ArrowRight sx={{ ml: 'auto' }} />
                        </MenuItem>
                    )}
                </Menu>
            )}

            {/* Local Sync Mode Submenu - Only for non-scan results */}
            {!isScanResults && (
                <Menu
                    anchorEl={syncModeAnchorEl}
                    open={Boolean(syncModeAnchorEl)}
                    onClose={handleCloseSyncModeMenu}
                    anchorOrigin={{
                        vertical: 'top',
                        horizontal: 'right',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'left',
                    }}
                >
                    <MenuItem
                        onClick={() => handleSyncModeSelect('local_health')}
                        selected={device.syncMode === 'local_health'}
                    >
                        <Typography variant="body2">Health Only</Typography>
                        {device.syncMode === 'local_health' && (
                            <CheckIcon sx={{ ml: 1, fontSize: 16 }} color="primary" />
                        )}
                    </MenuItem>
                    <MenuItem
                        onClick={() => handleSyncModeSelect('local_sync')}
                        selected={device.syncMode === 'local_sync'}
                    >
                        <Typography variant="body2">Full Sync</Typography>
                        {device.syncMode === 'local_sync' && (
                            <CheckIcon sx={{ ml: 1, fontSize: 16 }} color="primary" />
                        )}
                    </MenuItem>
                    <MenuItem
                        onClick={() => handleSyncModeSelect('disabled')}
                        selected={device.syncMode === 'disabled' || !device.syncMode}
                    >
                        <Typography variant="body2">Disabled</Typography>
                        {(device.syncMode === 'disabled' || !device.syncMode) && (
                            <CheckIcon sx={{ ml: 1, fontSize: 16 }} color="primary" />
                        )}
                    </MenuItem>
                </Menu>
            )}
        </>
    );
});

// Memoized TableRow component for devices with nesting support
const DeviceTableRow = memo(({
    hierarchicalDevice,
    visibleCols,
    allColumns,
    onDelete,
    onUpdate,
    navigate,
    updateStatuses,
    updatingDevices,
    onNestUnderGateway,
    onToggleNotifications,
    onSyncModeChange,
    notificationLoading,
    isScanResults,
    onResync,
    resyncingDevices,
    resyncedDevices,
    loadingDetails,
    deviceDetails,
    handleCardClick
}: {
    hierarchicalDevice: HierarchicalDevice,
    visibleCols: string[],
    allColumns: DeviceColumn[],
    onDelete: (e: React.MouseEvent, id: number) => void,
    onUpdate: (id: number, e: React.MouseEvent) => void,
    navigate: any,
    updateStatuses: Record<number, boolean>,
    updatingDevices: Set<number>,
    onNestUnderGateway: (deviceId: number) => void,
    onToggleNotifications: (deviceId: number) => void,
    onSyncModeChange: (deviceId: number, mode: string) => void,
    notificationLoading: Set<number>,
    isScanResults?: boolean,
    onResync?: (macAddress: string, ipAddress: string) => void,
    resyncingDevices?: { [macIp: string]: boolean },
    resyncedDevices?: Set<string>,
    loadingDetails?: Set<string>,
    deviceDetails?: Record<string, any>,
    handleCardClick?: (device: any) => void
}) => {
    const { device, children, level } = hierarchicalDevice;
    const hasChildren = children.length > 0;
    const isGateway = device.isGateway;
    const isChild = level > 0;
    const isCloudDevice = device.type === "Cloud Device";

    // Context menu state - Only for non-scan results
    const [contextMenu, setContextMenu] = useState<{
        mouseX: number;
        mouseY: number;
    } | null>(null);

    // Cloud sync mode submenu state
    const [syncModeAnchorEl, setSyncModeAnchorEl] = useState<null | HTMLElement>(null);

    // Handle right-click context menu - Only for non-scan results
    const handleContextMenu = useCallback((event: React.MouseEvent) => {
        if (isScanResults) return;
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
    }, [contextMenu, isScanResults]);

    const handleCloseContextMenu = useCallback(() => {
        setContextMenu(null);
        setSyncModeAnchorEl(null);
    }, []);

    const handleNestUnderGateway = useCallback(() => {
        onNestUnderGateway(device.id);
        handleCloseContextMenu();
    }, [device.id, onNestUnderGateway, handleCloseContextMenu]);

    const handleToggleNotifications = useCallback(() => {
        onToggleNotifications(device.id);
        handleCloseContextMenu();
    }, [device.id, onToggleNotifications, handleCloseContextMenu]);

    const handleSyncModeClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        setSyncModeAnchorEl(event.currentTarget);
    }, []);

    const handleCloseSyncModeMenu = useCallback(() => {
        setSyncModeAnchorEl(null);
    }, []);

    const handleSyncModeSelect = useCallback((mode: string) => {
        onSyncModeChange(device.id, mode);
        setSyncModeAnchorEl(null);
        handleCloseContextMenu();
    }, [device.id, onSyncModeChange, handleCloseContextMenu]);

    // Check if device is being resynced (for scan results)
    const isResyncing = useCallback((macAddress: string, ipAddress: string) => {
        return !!(resyncingDevices && resyncingDevices[`${macAddress}-${ipAddress}`]);
    }, [resyncingDevices]);

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
                    paddingLeft: isChild ? 1.5 : 0,
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
                        {isScanResults ? (device.instance || device.name || 'Unknown Device') : device.name}
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
                if (isScanResults && deviceDetails) {
                    const ip = device.IpAddress || device.ipAddress;
                    const details = (ip && deviceDetails[ip]) || {};
                    console.log(`[MODEL DEBUG] Device: ${device.instance}, IP: ${ip}, Details:`, details);
                    return details.deviceModel || details.DeviceModel || "";
                }
                return device.deviceModel || device.DeviceModel || "";

            case "ipAddress":
                return device.IpAddress || device.ipAddress || "";

            case "uniqueIdentifier":
                if (isScanResults) {
                    return (
                        device.MacAddress ||
                        device.macAddress ||
                        device.uniqueIdentifier ||
                        ""
                    );
                }
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
                // Don't show connection mode for scan results
                if (isScanResults) return "—";
                const connections = getEnhancedConnModeDisplay(device);
                return (
                    <Box sx={{
                        display: 'flex',
                        gap: 0.5,
                        flexWrap: 'wrap',
                        alignItems: 'center'
                    }}>
                        {connections.map((conn, index) => (
                            <Chip
                                key={index}
                                label={conn.label}
                                color={conn.color}
                                size="small"
                                sx={{
                                    fontWeight: 'medium',
                                    fontSize: '0.7rem',
                                    height: 22
                                }}
                            />
                        ))}
                    </Box>
                );

            case "firmware":
                let firmwareVersion = "";
                if (isScanResults && deviceDetails) {
                    const ip = device.IpAddress || device.ipAddress;
                    const details = (ip && deviceDetails[ip]) || {};
                    console.log(`[FIRMWARE DEBUG] Device: ${device.instance}, IP: ${ip}, Details:`, details);
                    firmwareVersion = details.firmwareVersion || details.FirmwareVersion || "";
                } else {
                    firmwareVersion = device.firmwareVersion || device.FirmwareVersion || "";
                }
                console.log(`[FIRMWARE DEBUG] Final firmware version: ${firmwareVersion}`);
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {firmwareVersion}
                        {/* rest of the JSX */}
                    </Box>
                );
            case "custom":
                // For scan results, use deviceDetails; for regular devices, use device properties
                let hasCustomFirmware = false;
                let isUnknown = false;

                if (isScanResults && deviceDetails) {
                    const ip = device.IpAddress || device.ipAddress;
                    const details = (ip && deviceDetails[ip]) || {};

                    if (details.customFirmware !== undefined) {
                        hasCustomFirmware = details.customFirmware === true;
                    } else {
                        // If we don't have the info yet, mark as unknown
                        isUnknown = true;
                    }
                } else {
                    hasCustomFirmware = device.hasCustomFirmware === true;
                }

                if (isUnknown) {
                    return <Chip label="Unknown" color="default" size="small" />;
                }

                return hasCustomFirmware ? (
                    <Chip label="Yes" color="info" size="small" />
                ) : (
                    <Chip label="No" size="small" />
                );
            case "heartbeatStatus":
                // Don't show heartbeat status for scan results
                if (isScanResults) return "—";

                const heartbeatInfo = getHeartbeatStatusInfo(
                    device,
                    device.heartbeatEnabled
                );

                // Add icon based on status
                let heartbeatIcon: React.ReactNode = undefined;
                switch (heartbeatInfo.label) {
                    case "Online":
                        heartbeatIcon = <NetworkCheckIcon fontSize="small" />;
                        break;
                    case "Online (Streaming)":
                        heartbeatIcon = <Cast fontSize="small" />;
                        break;
                    case "Stale":
                    case "Unstable":
                    case "Stale (Streaming)":
                        heartbeatIcon = <WarningIcon fontSize="small" />;
                        break;
                    case "Testing":
                        heartbeatIcon = <NetworkCheckIcon fontSize="small" />;
                        break;
                    case "Retesting":
                        heartbeatIcon = <RefreshIcon fontSize="small" />;
                        break;
                    case "Failed":
                    case "Timeout":
                    case "Offline":
                        heartbeatIcon = <SignalWifiOffIcon fontSize="small" />;
                        break;
                    default:
                        heartbeatIcon = undefined;
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
                // Don't show heartbeat protocol for scan results
                if (isScanResults) return "—";

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
                // Don't show last pinged for scan results
                if (isScanResults) return "—";

                return (
                    <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                        {formatRelativeTime(device.lastPinged)}
                    </Typography>
                );

            case "pingLatency":
                // Don't show ping latency for scan results
                if (isScanResults) return "—";

                return device.lastPingDurationMs ? `${device.lastPingDurationMs}ms` : "—";
            case "consecutiveFailures":
                // Don't show consecutive failures for scan results
                if (isScanResults) return "—";

                const failures = device.consecutivePingFailures || 0;
                return failures > 0 ? (
                    <Chip
                        label={failures}
                        color={failures >= 3 ? "error" : "warning"}
                        size="small"
                        sx={{ fontSize: '0.75rem', height: 20 }}
                    />
                ) : "0";
            case "notifications":
                // Don't show notifications for scan results
                if (isScanResults) return "—";

                const notificationInfo = getNotificationsStatusInfo(device);
                return (
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {notificationInfo.enabled ? (
                            <NotificationsIcon
                                fontSize="small"
                                color="success"
                                sx={{ opacity: 0.8 }}
                            />
                        ) : (
                            <NotificationsOffIcon
                                fontSize="small"
                                color="disabled"
                                sx={{ opacity: 0.6 }}
                            />
                        )}
                    </Box>
                );
            case "syncMode": {
                // Don't show sync mode for scan results
                if (isScanResults) return "—";

                const syncModeInfo = getSyncModeInfo(device);
                return (
                    <Chip
                        label={syncModeInfo.label}
                        color={syncModeInfo.color}
                        size="small"
                        sx={{
                            fontWeight: 'medium',
                            fontSize: '0.75rem',
                            height: 24
                        }}
                    />
                );
            }
            case "actions":
                // Get the alignment from the column definition (which uses the feature flag)
                const column = allColumns.find(col => col.field === field);
                const alignment = column?.align || 'right';

                // Convert alignment to flexbox justify-content value
                const justifyContent = alignment === 'left' ? 'flex-start' :
                    alignment === 'center' ? 'center' : 'flex-end';

                return (
                    <Box sx={{ display: 'flex', justifyContent, gap: 0.5 }}>
                        {/* Resync button for scan results - existing devices only */}
                        {isScanResults && device.status === "DEVICE_EXISTS" && onResync &&
                            resyncedDevices && !resyncedDevices.has(device.macAddress) && (
                                <Tooltip title="Resync Device">
                                    <IconButton
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onResync(
                                                device.macAddress || device.MacAddress,
                                                device.ipAddress || device.IpAddress
                                            );
                                        }}
                                        disabled={isResyncing(device.macAddress, device.ipAddress)}
                                    >
                                        {isResyncing(device.macAddress, device.ipAddress) ? (
                                            <CircularProgress size={16} />
                                        ) : (
                                            <SyncIcon fontSize="small" />
                                        )}
                                    </IconButton>
                                </Tooltip>
                            )}

                        {/* Update button for non-scan results */}
                        {!isScanResults && updateStatuses[device.id] === true && (
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

                        {/* Delete button - only for non-scan results */}
                        {!isScanResults && (
                            <Tooltip title="Delete">
                                <IconButton
                                    size="small"
                                    onClick={(e) => onDelete(e, device.id)}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                );
            default:
                return null;
        }
    }, [device, onDelete, onUpdate, updateStatuses, updatingDevices, allColumns, level, isGateway, hasChildren, isChild, isScanResults, deviceDetails, onResync, resyncedDevices, resyncingDevices, isResyncing]);

    const renderRows = () => {
        const rows = [];

        // Main device row
        rows.push(
            <TableRow
                key={device.id || device.ipAddress}
                hover
                onClick={isScanResults ? (handleCardClick ? (e) => {
                    e.stopPropagation();
                    handleCardClick(device);
                } : undefined) : () => navigate(`/configure-device/${device.id}`)}
                onContextMenu={handleContextMenu}
                sx={{
                    cursor: isScanResults ? "default" : "pointer",
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
                            case "notifications":
                                return { minWidth: 80, width: 80 };
                            case "connMode":
                                return { minWidth: 180, width: 'auto' };
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
                            case "syncMode":
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
                            {getDeviceCell(field)}
                        </TableCell>
                    );
                })}
            </TableRow>
        );

        // Child rows (only for non-scan results)
        if (!isScanResults && hasChildren) {
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
                onDelete={onDelete}
                onUpdate={onUpdate}
                navigate={navigate}
                updateStatuses={updateStatuses}
                updatingDevices={updatingDevices}
                onNestUnderGateway={onNestUnderGateway}
                onToggleNotifications={onToggleNotifications}
                onSyncModeChange={onSyncModeChange}
                notificationLoading={notificationLoading}
                isScanResults={isScanResults}
                onResync={onResync}
                resyncingDevices={resyncingDevices}
                resyncedDevices={resyncedDevices}
                loadingDetails={loadingDetails}
                deviceDetails={deviceDetails}
                handleCardClick={handleCardClick}
            />
        );
        return [childComponent];
    };

    return <>
        {renderRows()}

        {/* Context Menu - Only for non-scan results */}
        {!isScanResults && (
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
                        onNestUnderGateway(device.id);
                        handleCloseContextMenu();
                    }}>
                        <LinkOffIcon sx={{ mr: 1 }} />
                        Remove from Gateway
                    </MenuItem>
                )}

                {/* Notification toggle option - now handles both enable and disable */}
                <MenuItem
                    onClick={handleToggleNotifications}
                    disabled={notificationLoading.has(device.id)}
                >
                    {device.pushNotifications ? (
                        <>
                            <NotificationsOffIcon sx={{ mr: 1 }} />
                            {notificationLoading.has(device.id) ? 'Disabling...' : 'Disable Notifications'}
                        </>
                    ) : (
                        <>
                            <NotificationsIcon sx={{ mr: 1 }} />
                            {notificationLoading.has(device.id) ? 'Enabling...' : 'Enable Notifications'}
                        </>
                    )}
                </MenuItem>

                {/* Cloud Sync Mode submenu - Only show for non-cloud devices */}
                {!isCloudDevice && (
                    <MenuItem onClick={handleSyncModeClick}>
                        <CloudIcon sx={{ mr: 1 }} />
                        Cloud Sync Mode
                        <ArrowRight sx={{ ml: 'auto' }} />
                    </MenuItem>
                )}
            </Menu>
        )}

        {/* Cloud Sync Mode Submenu - Only for non-scan results */}
        {!isScanResults && (
            <Menu
                anchorEl={syncModeAnchorEl}
                open={Boolean(syncModeAnchorEl)}
                onClose={handleCloseSyncModeMenu}
                anchorOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'left',
                }}
            >
                <MenuItem
                    onClick={() => handleSyncModeSelect('local_health')}
                    selected={device.syncMode === 'local_health'}
                >
                    <Typography variant="body2">Health Only</Typography>
                    {device.syncMode === 'local_health' && (
                        <CheckIcon sx={{ ml: 1, fontSize: 16 }} color="primary" />
                    )}
                </MenuItem>
                <MenuItem
                    onClick={() => handleSyncModeSelect('local_sync')}
                    selected={device.syncMode === 'local_sync'}
                >
                    <Typography variant="body2">Full Sync</Typography>
                    {device.syncMode === 'local_sync' && (
                        <CheckIcon sx={{ ml: 1, fontSize: 16 }} color="primary" />
                    )}
                </MenuItem>
                <MenuItem
                    onClick={() => handleSyncModeSelect('disabled')}
                    selected={device.syncMode === 'disabled' || !device.syncMode}
                >
                    <Typography variant="body2">Disabled</Typography>
                    {(device.syncMode === 'disabled' || !device.syncMode) && (
                        <CheckIcon sx={{ ml: 1, fontSize: 16 }} color="primary" />
                    )}
                </MenuItem>
            </Menu>
        )}
    </>;
});

// DevicesTable component with column management, gateway nesting, view modes, notifications, and scan results support
const DevicesTable: React.FC<{
    devices: any[];
    title: string;
    updateStatuses: Record<number, boolean>;
    updatingDevices: Set<number>;
    onDelete: (e: React.MouseEvent, id: number) => void;
    onUpdate: (id: number, e: React.MouseEvent) => void;
    navigate: any;
    storageKeySuffix?: string;
    onDevicesChange?: () => void;
    refreshInterval?: number;
    onRefreshIntervalChange?: (interval: number) => void;
    refreshIntervalOptions?: Array<{ value: number; label: string }>;
    isCloudDevicesTable?: boolean;
    onToggleNotifications?: (deviceId: number) => void;
    onSyncModeChange?: (deviceId: number, mode: string) => void;
    // New scan-specific props
    isScanResults?: boolean;
    scanViewMode?: string;
    onScanViewModeChange?: (mode: string) => void;
    onResync?: (macAddress: string, ipAddress: string) => void;
    resyncingDevices?: { [macIp: string]: boolean };
    resyncedDevices?: Set<string>;
    loadingDetails?: Set<string>;
    deviceDetails?: Record<string, any>;
    handleCardClick?: (device: any) => void;
}> = ({
    devices,
    title,
    updateStatuses,
    updatingDevices,
    onDelete,
    onUpdate,
    navigate,
    storageKeySuffix = "",
    onDevicesChange,
    refreshInterval,
    onRefreshIntervalChange,
    refreshIntervalOptions,
    isCloudDevicesTable = false,
    onToggleNotifications,
    onSyncModeChange,
    // New scan-specific props
    isScanResults = false,
    scanViewMode,
    onScanViewModeChange,
    onResync,
    resyncingDevices,
    resyncedDevices,
    loadingDetails,
    deviceDetails,
    handleCardClick
}) => {
        const localStorageKey = `${STORAGE_KEY_DEVICES_COLUMNS}${storageKeySuffix}`;
        const sortStorageKey = `${STORAGE_KEY_DEVICES_SORT}${storageKeySuffix}`;
        const viewModeStorageKey = `${STORAGE_KEY_VIEW_MODE}${storageKeySuffix}`;

        // Use feature flags hook
        const flags = useFeatureFlags();
        const theme = useTheme();
        const isMobile = useMediaQuery(theme.breakpoints.down('md'));

        // View mode state with proper isolation
        const [viewMode, setViewMode] = useState<ViewMode>(() => {
            // For scan results, use the passed scanViewMode
            if (isScanResults && scanViewMode) {
                return scanViewMode as ViewMode;
            }
            // For regular tables, use localStorage
            const stored = localStorage.getItem(viewModeStorageKey);
            return (stored as ViewMode) || 'table';
        });

        // Update view mode when scanViewMode changes (for scan results)
        useEffect(() => {
            if (isScanResults && scanViewMode) {
                setViewMode(scanViewMode as ViewMode);
            }
        }, [isScanResults, scanViewMode]);

        // Listen for view mode changes from bottom action bar (mobile only) - only for non-scan results
        useEffect(() => {
            if (isScanResults) return; // Don't listen to bottom action bar for scan results

            const handleBottomActionViewModeChange = (e: CustomEvent) => {
                // Only respond to bottom action bar changes when in mobile mode
                if (isMobile && e.detail.mode) {
                    const newMode = e.detail.mode as ViewMode;
                    setViewMode(newMode);
                    localStorage.setItem(viewModeStorageKey, newMode);
                }
            };

            // Listen for localStorage changes from other tabs/windows
            // But only for this specific table's storage key
            const handleStorageChange = (e: StorageEvent) => {
                if (e.key === viewModeStorageKey && e.newValue) {
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
        }, [viewModeStorageKey, isMobile, isScanResults]);

        // Handle view mode change from desktop toggle buttons
        const handleViewModeChange = useCallback((event: React.MouseEvent<HTMLElement>, newViewMode: ViewMode) => {
            if (newViewMode !== null) {
                setViewMode(newViewMode);

                if (isScanResults) {
                    // For scan results, use the callback
                    if (onScanViewModeChange) {
                        onScanViewModeChange(newViewMode);
                    }
                } else {
                    // For regular tables, save to localStorage
                    localStorage.setItem(viewModeStorageKey, newViewMode);

                    // Only dispatch event for bottom action bar sync on mobile
                    // Desktop tables should be independent
                    if (isMobile) {
                        window.dispatchEvent(new CustomEvent('bottom-action-view-mode-change', {
                            detail: { mode: newViewMode }
                        }));
                    }
                }
            }
        }, [viewModeStorageKey, isMobile, isScanResults, onScanViewModeChange]);

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
        // For scan results, use a simplified column set
        if (isScanResults) {
            return ["actions", "name", "type", "model", "ipAddress", "uniqueIdentifier", "status", "firmware", "custom"];
        }

        const stored = localStorage.getItem(localStorageKey);

        // Use different defaults based on table type
        let defaultVisible: string[];
        if (isCloudDevicesTable) {
            defaultVisible = defaultCloudDeviceColumns;
        } else {
            defaultVisible = defaultLocalDeviceColumns;
        }

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

    // Notification management state
    const [notificationLoading, setNotificationLoading] = useState<Set<number>>(new Set());
    const [notificationError, setNotificationError] = useState<string | null>(null);

    // Popover anchor
    const [anchorDeviceCols, setAnchorDeviceCols] = useState<HTMLElement | null>(null);

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

    // Build hierarchical structure - only for non-scan results
    const hierarchicalDevices = useMemo(() => {
        if (isScanResults) {
            // For scan results, create flat hierarchy (no nesting)
            return devices.map(device => ({
                device,
                children: [],
                level: 0
            }));
        }

        const gateways = devices.filter(d => d.isGateway);
        const children = devices.filter(d => d.gatewayId && !d.isGateway);
        const standalone = devices.filter(d => !d.isGateway && !d.gatewayId);

        const buildHierarchy = (device: any, level: number = 0): HierarchicalDevice => {
            const deviceChildren = children.filter(c => c.gatewayId === device.id);

            return {
                device,
                children: deviceChildren.map(child => buildHierarchy(child, level + 1)),
                level
            };
        };

        const result: HierarchicalDevice[] = [];

        gateways.forEach(gateway => {
            result.push(buildHierarchy(gateway));
        });

        standalone.forEach(device => {
            result.push(buildHierarchy(device));
        });

        return result;
    }, [devices, isScanResults]);

    // Sort the hierarchical devices
    const sortedHierarchicalDevices = useMemo(() => {
        const { orderBy, order } = sortState;
        const comparator = (a: HierarchicalDevice, b: HierarchicalDevice) => {
            let valueA: any;
            let valueB: any;

            switch (orderBy) {
                case 'name':
                    if (isScanResults) {
                        valueA = (a.device.instance || a.device.name || 'Unknown Device').toLowerCase();
                        valueB = (b.device.instance || b.device.name || 'Unknown Device').toLowerCase();
                    } else {
                        valueA = a.device.name?.toLowerCase() || '';
                        valueB = b.device.name?.toLowerCase() || '';
                    }
                    break;
                case 'type':
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
                    if (isScanResults && deviceDetails) {
                        const detailsA = deviceDetails[a.device.ipAddress] || {};
                        const detailsB = deviceDetails[b.device.ipAddress] || {};
                        valueA = detailsA.deviceModel?.toLowerCase() || '';
                        valueB = detailsB.deviceModel?.toLowerCase() || '';
                    } else {
                        valueA = a.device.deviceModel?.toLowerCase() || '';
                        valueB = b.device.deviceModel?.toLowerCase() || '';
                    }
                    break;
                case 'ipAddress':
                    valueA = a.device.ipAddress || '';
                    valueB = b.device.ipAddress || '';
                    break;
                case 'uniqueIdentifier':
                    if (isScanResults) {
                        valueA = (a.device.macAddress || a.device.uniqueIdentifier || '').toLowerCase();
                        valueB = (b.device.macAddress || b.device.uniqueIdentifier || '').toLowerCase();
                    } else {
                        valueA = a.device.uniqueIdentifier?.toLowerCase() || '';
                        valueB = b.device.uniqueIdentifier?.toLowerCase() || '';
                    }
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
                    if (isScanResults && deviceDetails) {
                        const detailsA = deviceDetails[a.device.ipAddress] || {};
                        const detailsB = deviceDetails[b.device.ipAddress] || {};
                        valueA = detailsA.firmwareVersion?.toLowerCase() || '';
                        valueB = detailsB.firmwareVersion?.toLowerCase() || '';
                    } else {
                        valueA = a.device.firmwareVersion?.toLowerCase() || '';
                        valueB = b.device.firmwareVersion?.toLowerCase() || '';
                    }
                    break;
                case 'custom':
                    if (isScanResults && deviceDetails) {
                        const detailsA = deviceDetails[a.device.ipAddress] || {};
                        const detailsB = deviceDetails[b.device.ipAddress] || {};
                        valueA = detailsA.customFirmware ? 1 : 0;
                        valueB = detailsB.customFirmware ? 1 : 0;
                    } else {
                        valueA = a.device.hasCustomFirmware ? 1 : 0;
                        valueB = b.device.hasCustomFirmware ? 1 : 0;
                    }
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
                case 'notifications':
                    valueA = a.device.pushNotifications ? 1 : 0;
                    valueB = b.device.pushNotifications ? 1 : 0;
                    break;
                case 'syncMode':
                    valueA = a.device.syncMode?.toLowerCase() || '';
                    valueB = b.device.syncMode?.toLowerCase() || '';
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

        return [...hierarchicalDevices].sort(comparator);
    }, [hierarchicalDevices, sortState, isScanResults, deviceDetails]);

    // Handle toggle notifications
    const handleToggleNotifications = useCallback(async (deviceId: number) => {
        const device = devices.find(d => d.id === deviceId);
        if (!device) return;

        try {
            setNotificationLoading(prev => new Set([...prev, deviceId]));
            setNotificationError(null);

            // Toggle the current state
            const newState = !device.pushNotifications;
            const action = newState ? 'enable' : 'disable';

            const response = await fetch(`/api/cloud-auth/devices/${deviceId}/notifications/${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('cloud_proxy_token') || ''}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                console.log(result.message);

                if (onDevicesChange) {
                    onDevicesChange();
                } else {
                    window.location.reload();
                }
            } else {
                const error = await response.json();
                setNotificationError(error.message || `Failed to ${action} notifications`);
            }
        } catch (error) {
            setNotificationError(`Error ${device.pushNotifications ? 'disabling' : 'enabling'} notifications`);
            console.error('Error toggling notifications:', error);
        } finally {
            setNotificationLoading(prev => {
                const newSet = new Set(prev);
                newSet.delete(deviceId);
                return newSet;
            });
        }
    }, [devices, onDevicesChange]);

    // Add the new sync mode change handler
    const handleSyncModeChange = useCallback(async (deviceId: number, mode: string) => {
        try {
            const response = await fetch(`/api/devices/${deviceId}/sync-mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ syncMode: mode })
            });

            if (response.ok) {
                const result = await response.json();
                console.log(result.message);

                if (onDevicesChange) {
                    onDevicesChange();
                } else {
                    window.location.reload();
                }
            } else {
                const error = await response.json();
                console.error('Failed to update sync mode:', error.message);
            }
        } catch (error) {
            console.error('Error updating sync mode:', error);
        }
    }, [onDevicesChange]);

    // Handle nesting under gateway
    const handleNestUnderGateway = useCallback(async (deviceId: number) => {
        const device = devices.find(d => d.id === deviceId);
        if (!device) return;

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
                    console.log(result.message);
                    if (onDevicesChange) {
                        onDevicesChange();
                    } else {
                        window.location.reload();
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
                console.log(result.message);

                setNestingDialog({ open: false, deviceId: null, deviceName: '' });
                setSelectedGatewayId(null);

                if (onDevicesChange) {
                    onDevicesChange();
                } else {
                    window.location.reload();
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

    // Persist sort state when it changes - only for non-scan results
    useEffect(() => {
        if (!isScanResults) {
            localStorage.setItem(sortStorageKey, JSON.stringify(sortState));
        }
    }, [sortState, sortStorageKey, isScanResults]);

    // Persist visible columns on change - only for non-scan results
    useEffect(() => {
        if (!isScanResults) {
            localStorage.setItem(localStorageKey, JSON.stringify(visibleDeviceCols));
        }
    }, [visibleDeviceCols, localStorageKey, isScanResults]);

    // Memoize event handlers
    const openDevicePopover = useCallback((e: MouseEvent<HTMLElement>) => {
        e.stopPropagation();
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

    // Use passed handlers or default to internal ones
    const finalToggleNotifications = onToggleNotifications || handleToggleNotifications;
    const finalSyncModeChange = onSyncModeChange || handleSyncModeChange;

    // Handle card click for scan results
    const defaultHandleCardClick = useCallback((device: any) => {
        if (isScanResults) {
            // Trigger the add device modal from parent component
            window.dispatchEvent(new CustomEvent('scan-device-selected', {
                detail: { device }
            }));
        }
    }, [isScanResults]);
    const finalHandleCardClick = handleCardClick || defaultHandleCardClick;

    return (
    <>
            {/* Table header with view mode toggle, auto-refresh and column selector */}
            <Box display="flex" alignItems="center" mb={1} flexWrap="wrap" gap={2}>
                <Typography variant="h6">{title}</Typography>

                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    {/* View Mode Toggle - ONLY show on desktop (hidden on mobile since it's in bottom bar) and not for scan results */}
                    {!isMobile && !isScanResults && (
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

                    {/* View Mode Toggle for scan results - show on both desktop and mobile */}
                    {isScanResults && (
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

                    {/* Auto-Refresh Control - Only for non-scan results */}
                    {!isScanResults && refreshInterval !== undefined && onRefreshIntervalChange && refreshIntervalOptions && (
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

                    {/* Columns Button - Only show in table view and not for scan results */}
                    {viewMode === 'table' && !isScanResults && (
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
                    )}
                </Box>

                {/* Columns Popover - Only for non-scan results */}
                {!isScanResults && (
                    <Popover
                        open={Boolean(anchorDeviceCols)}
                        anchorEl={anchorDeviceCols}
                        onClose={closeDevicePopover}
                    >
                        <List dense>
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
                )}
            </Box>

            {/* Error Display */}
            {notificationError && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setNotificationError(null)}>
                    {notificationError}
                </Alert>
            )}

                {/* Render based on view mode */}
                {viewMode === 'table' ? (
                    /* Table View */
                    <TableContainer component={Paper} sx={{ mb: 4 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ backgroundColor: 'rgba(0, 0, 0, 0.04)' }}>
                                    {visibleDeviceCols.map((field) => {
                                        const colDef = deviceColumns.find((c) => c.field === field)!;

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
                                                case "notifications":
                                                    return { minWidth: 80, width: 80 };
                                                case "connMode":
                                                    return { minWidth: 180, width: 'auto' };
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
                                                case "syncMode":
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
                                {sortedHierarchicalDevices.length > 0 ? (
                                    sortedHierarchicalDevices.map((hierarchicalDevice) => (
                                        <DeviceTableRow
                                            key={hierarchicalDevice.device.id || hierarchicalDevice.device.ipAddress}
                                            hierarchicalDevice={hierarchicalDevice}
                                            visibleCols={visibleDeviceCols}
                                            allColumns={deviceColumns}
                                            onDelete={onDelete}
                                            onUpdate={onUpdate}
                                            navigate={navigate}
                                            updateStatuses={updateStatuses}
                                            updatingDevices={updatingDevices}
                                            onNestUnderGateway={handleNestUnderGateway}
                                            onToggleNotifications={finalToggleNotifications}
                                            onSyncModeChange={finalSyncModeChange}
                                            notificationLoading={notificationLoading}
                                            isScanResults={isScanResults}
                                            onResync={onResync}
                                            resyncingDevices={resyncingDevices}
                                            resyncedDevices={resyncedDevices}
                                            loadingDetails={loadingDetails}
                                            deviceDetails={deviceDetails}
                                            handleCardClick={finalHandleCardClick}
                                        />
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={visibleDeviceCols.length} sx={{ textAlign: 'center', py: 3 }}>
                                            <Typography color="textSecondary">
                                                {isScanResults ? "No devices found in scan" : `No ${title.toLowerCase()} found`}
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
                        mb: 4
                    }}>
                        {sortedHierarchicalDevices.length > 0 ? (
                            sortedHierarchicalDevices.map((hierarchicalDevice) => (
                                <DeviceCard
                                    key={hierarchicalDevice.device.id || hierarchicalDevice.device.ipAddress}
                                    hierarchicalDevice={hierarchicalDevice}
                                    viewMode={viewMode as 'standard' | 'mini'}
                                    onDelete={onDelete}
                                    onUpdate={onUpdate}
                                    navigate={navigate}
                                    updateStatuses={updateStatuses}
                                    updatingDevices={updatingDevices}
                                    onNestUnderGateway={handleNestUnderGateway}
                                    onToggleNotifications={finalToggleNotifications}
                                    onSyncModeChange={finalSyncModeChange}
                                    notificationLoading={notificationLoading}
                                    isScanResults={isScanResults}
                                    onResync={onResync}
                                    resyncingDevices={resyncingDevices}
                                    resyncedDevices={resyncedDevices}
                                    loadingDetails={loadingDetails}
                                    deviceDetails={deviceDetails}
                                    handleCardClick={finalHandleCardClick}
                                />
                            ))
                        ) : (
                            <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                                <Typography color="textSecondary">
                                    {isScanResults ? "No devices found in scan" : `No ${title.toLowerCase()} found`}
                                </Typography>
                            </Paper>
                        )}
                    </Box>
                )}

                {/* Nesting Dialog - Only for non-scan results */}
                {!isScanResults && (
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
                )}
            </>
        );
    };

export default DevicesTable;