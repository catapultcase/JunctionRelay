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
import { Typography, Box, CircularProgress, Chip, Tooltip, IconButton, Menu, MenuItem, Card, CardContent, Divider } from "@mui/material";
import UpdateIcon from '@mui/icons-material/Update';
import DeleteIcon from '@mui/icons-material/Delete';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import MemoryIcon from '@mui/icons-material/Memory';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import CloudIcon from '@mui/icons-material/Cloud';
import ArrowRight from '@mui/icons-material/KeyboardArrowRight';
import CheckIcon from '@mui/icons-material/Check';
import { getHeartbeatStatusInfo, formatRelativeTime, getDeviceStatusInfo, getEnhancedConnModeDisplay } from './Devices_Helpers';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import type { NavigateFunction } from 'react-router-dom';
import type { Device } from '../types/entities';
import type { HierarchicalDevice } from '../types/devices';


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
    onSyncModeChange,
    notificationLoading,
}: {
    hierarchicalDevice: HierarchicalDevice,
    viewMode: 'standard' | 'mini',
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

    // Context menu state
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

    const getCardHeight = () => {
        return viewMode === 'mini' ? 120 : 220;
    };

    const statusInfo = getDeviceStatusInfo(device.status);
    const connModeDisplay = getEnhancedConnModeDisplay(device);
    const heartbeatInfo = getHeartbeatStatusInfo(device, device.heartbeatEnabled);

    const renderCard = (deviceData: Device, deviceLevel: number) => (
        <Card
            key={deviceData.id}
            variant="outlined"
            sx={{
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                position: 'relative',
                minHeight: getCardHeight(),
                display: 'flex',
                flexDirection: 'column',
                marginLeft: deviceLevel > 0 ? 2 : 0,
                marginTop: deviceLevel > 0 ? 1 : 0,
                '&:hover': {
                    boxShadow: 6,
                    transform: 'translateY(-2px)',
                    backgroundColor: 'action.hover'
                },
                border: isGateway ? '2px solid' : '1px solid',
                borderColor: isGateway ? 'primary.main' :
                    deviceData.status === 'Active' ? 'success.main' : 'divider',
                backgroundColor: isChild ? 'rgba(0, 0, 0, 0.02)' : 'inherit'
            }}
            onClick={() => {
                if (deviceData.type === "XSD" || deviceData.isXSD) {
                    navigate(`/xsd/${deviceData.id}/configure`);
                } else {
                    navigate(`/configure-device/${deviceData.id}`);
                }
            }}
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
                        {deviceData.name}
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
                            {deviceData.deviceModel && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Model:</strong> {deviceData.deviceModel}
                                </Typography>
                            )}
                            {deviceData.firmwareVersion && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Firmware:</strong> {deviceData.firmwareVersion}
                                </Typography>
                            )}
                        </Box>
                    </>
                )}

                {/* Status Chips */}
                <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: viewMode === 'mini' ? 0.5 : 1,
                    mt: 'auto'
                }}>
                    {/* Connection Mode - Only show for non-cloud devices and non-scan results */}
                    {!isCloudDevice && (
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
                    {(device.heartbeatEnabled || isCloudDevice) && (
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

                    {device.lastPinged && (
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
            </CardContent>

            {/* Action Buttons at Bottom - Outside CardContent */}
            <Box sx={{
                p: viewMode === 'mini' ? 0.5 : 1,
                pt: 0,
                display: 'flex',
                justifyContent: 'space-between',
                gap: viewMode === 'mini' ? 0.5 : 1
            }}>
                {/* Left side: Management buttons */}
                <Box sx={{ display: 'flex', gap: viewMode === 'mini' ? 0.5 : 1 }}>
                    {/* Update button */}
                    {updateStatuses[deviceData.id] === true && (
                        <Tooltip title="Update Firmware">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdate(deviceData.id, e);
                                }}
                                disabled={updatingDevices.has(deviceData.id)}
                                sx={{
                                    padding: viewMode === 'mini' ? '4px' : '6px',
                                    border: '1px solid',
                                    borderColor: 'warning.main',
                                    color: 'warning.main',
                                    '&:hover': {
                                        backgroundColor: 'warning.main',
                                        color: 'warning.contrastText'
                                    }
                                }}
                            >
                                {updatingDevices.has(deviceData.id) ? (
                                    <CircularProgress size={16} />
                                ) : (
                                    <UpdateIcon sx={{ fontSize: viewMode === 'mini' ? '0.9rem' : '1rem' }} />
                                )}
                            </IconButton>
                        </Tooltip>
                    )}

                    {/* Delete button */}
                    <Tooltip title="Delete">
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(e, deviceData.id);
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
                    </Tooltip>
                </Box>

                {/* Right side: Reserved for future primary actions */}
                <Box sx={{ display: 'flex', gap: viewMode === 'mini' ? 0.5 : 1 }}>
                    {/* Future: Add primary action buttons here if needed */}
                </Box>
            </Box>
        </Card>
    );

    const cards = [];

    // Main device card
    cards.push(renderCard(device, level));

    // Child cards - only for non-scan results
    if (hasChildren) {
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
                    onSyncModeChange={onSyncModeChange}
                    notificationLoading={notificationLoading}
                />
            );
        });
    }

    return (
        <>
            {cards}

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

            {/* Local Sync Mode Submenu */}
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
        </>
    );
});

export default DeviceCard;
