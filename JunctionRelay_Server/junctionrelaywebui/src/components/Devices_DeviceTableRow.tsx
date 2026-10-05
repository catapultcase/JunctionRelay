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

import React, { useState, useCallback, memo } from "react";
import { Typography, Box, CircularProgress, Chip, TableCell, TableRow, Tooltip, IconButton, Menu, MenuItem } from "@mui/material";
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
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import CloudIcon from '@mui/icons-material/Cloud';
import ArrowRight from '@mui/icons-material/KeyboardArrowRight';
import CheckIcon from '@mui/icons-material/Check';
import { DeviceColumn, getHeartbeatStatusInfo, formatRelativeTime, getDeviceStatusInfo, getEnhancedConnModeDisplay, getDeviceTypeInfo, getSyncModeInfo } from './Devices_Helpers';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import type { NavigateFunction } from 'react-router-dom';
import type { HierarchicalDevice } from '../types/devices';

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
    onSyncModeChange,
    notificationLoading,
}: {
    hierarchicalDevice: HierarchicalDevice,
    visibleCols: string[],
    allColumns: DeviceColumn[],
    onDelete: (e: React.MouseEvent, id: number) => void,
    onUpdate: (id: number, e: React.MouseEvent) => void,
    navigate: NavigateFunction,
    updateStatuses: Record<number, boolean>,
    updatingDevices: Set<number>,
    onNestUnderGateway: (deviceId: number) => void,
    onSyncModeChange: (deviceId: number, mode: string) => void,
    notificationLoading: Set<number>,
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
    // Master switch (Settings -> Cloud Sync -> Devices). Off = the submenu is
    // replaced by a pointer to Settings; per-device modes only matter once on.
    const deviceSyncFlags = useFeatureFlags();
    const deviceCloudSyncOn = !deviceSyncFlags || deviceSyncFlags.device_cloud_sync_enabled === true;

    // Handle right-click context menu - Only for non-scan results
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
        setSyncModeAnchorEl(null);
    }, []);

    const handleNestUnderGateway = useCallback(() => {
        onNestUnderGateway(device.id);
        handleCloseContextMenu();
    }, [device.id, onNestUnderGateway, handleCloseContextMenu]);

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

            case "COMPort":
                return device.comPort || "";

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
                return device.firmwareVersion || "";

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
            case "syncMode": {

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

                        {/* Update button */}
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

                        {/* Delete button */}
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
    }, [device, onDelete, onUpdate, updateStatuses, updatingDevices, allColumns, level, isGateway, hasChildren, isChild]);

    const renderRows = () => {
        const rows = [];

        // Main device row
        rows.push(
            <TableRow
                key={device.id}
                hover
                onClick={() => {
                    if (device.type === "XSD" || device.isXSD) {
                        navigate(`/xsd/${device.id}/configure`);
                    } else {
                        navigate(`/configure-device/${device.id}`);
                    }
                }}
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
                            case "COMPort":
                                return { minWidth: 140, width: 140 };
                            case "uniqueIdentifier":
                                return { minWidth: 160, width: 'auto' };
                            case "status":
                                return { minWidth: 100, width: 100 };
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
                onDelete={onDelete}
                onUpdate={onUpdate}
                navigate={navigate}
                updateStatuses={updateStatuses}
                updatingDevices={updatingDevices}
                onNestUnderGateway={onNestUnderGateway}
                onSyncModeChange={onSyncModeChange}
                notificationLoading={notificationLoading}
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
                    onNestUnderGateway(device.id);
                    handleCloseContextMenu();
                }}>
                    <LinkOffIcon sx={{ mr: 1 }} />
                    Remove from Gateway
                </MenuItem>
            )}

            {/* Cloud Sync Mode submenu - Only show for non-cloud devices.
                With the master switch off, the entry names the fact and
                clicking it goes to Settings to turn it on. */}
            {!isCloudDevice && (deviceCloudSyncOn ? (
                <MenuItem onClick={handleSyncModeClick}>
                    <CloudIcon sx={{ mr: 1 }} />
                    Cloud Sync Mode
                    <ArrowRight sx={{ ml: 'auto' }} />
                </MenuItem>
            ) : (
                <MenuItem onClick={() => { handleCloseContextMenu(); navigate('/settings'); }}>
                    <CloudIcon sx={{ mr: 1, opacity: 0.5 }} />
                    Cloud Sync Disabled
                </MenuItem>
            ))}
        </Menu>

        {/* Cloud Sync Mode Submenu */}
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
    </>;
});

export default DeviceTableRow;
