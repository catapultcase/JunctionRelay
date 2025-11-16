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

import React, { memo } from "react";
import {
    Typography,
    Box,
    Chip,
    Tooltip,
    IconButton,
    Card,
    CardContent,
    Divider,
} from "@mui/material";
// Icon imports
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ComputerIcon from '@mui/icons-material/Computer';
import SensorsIcon from '@mui/icons-material/Sensors';
import TvIcon from '@mui/icons-material/Tv';

// Memoized VirtualDevice Card component for tile views
const VirtualDeviceCard = memo(({
    device,
    viewMode,
    onDelete,
    onEdit,
    onCardClick,
}: {
    device: any,
    viewMode: 'standard' | 'mini',
    onDelete: (e: React.MouseEvent, id: number) => void,
    onEdit: (e: React.MouseEvent, device: any) => void,
    onCardClick?: () => void,
}) => {
    const handleCardClick = () => {
        if (onCardClick) {
            onCardClick();
        }
    };

    const getCardHeight = () => {
        return viewMode === 'mini' ? 120 : 220;
    };

    // Determine status color
    let statusColor: "default" | "success" | "error" | "warning" = 'default';
    const status = device.status || 'Unknown';

    if (status === 'Connected') {
        statusColor = 'success';
    } else if (status === 'Disconnected' || status === 'Error') {
        statusColor = 'error';
    } else if (status === 'Warning') {
        statusColor = 'warning';
    }

    // Get active modes
    const activeModes = [];
    if (device.virtualDevice_Mode1_Enabled) activeModes.push('Mode 1');
    if (device.virtualDevice_Mode2_Enabled) activeModes.push('Mode 2');
    if (device.virtualDevice_Mode3_Enabled) activeModes.push('Mode 3');

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
            onClick={handleCardClick}
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
                    : status
                }
            </Box>

            <CardContent sx={{
                flex: 1,
                pt: viewMode === 'mini' ? 2.5 : 5,
                p: viewMode === 'mini' ? 1 : 2
            }}>
                {/* Device Name with icon */}
                <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mb: viewMode === 'mini' ? 0.5 : 1,
                    gap: 0.5
                }}>
                    <ComputerIcon fontSize="small" />
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
                        {device.name}
                    </Typography>
                </Box>

                {/* Device Details */}
                {viewMode === 'standard' && (
                    <>
                        <Divider sx={{ mb: 1 }} />
                        <Box sx={{ mb: 1 }}>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Address:</strong> {device.ipAddress}:{device.webSocketPort}
                            </Typography>
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Model:</strong> {device.deviceModel || "Unknown"}
                            </Typography>
                            {device.firmwareVersion && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>Firmware:</strong> {device.firmwareVersion}
                                </Typography>
                            )}
                        </Box>
                    </>
                )}

                {/* Mode Chips */}
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
                        {activeModes.length > 0 ? (
                            activeModes.map((mode) => (
                                <Chip
                                    key={mode}
                                    label={mode}
                                    color={mode === 'Mode 1' ? 'primary' : mode === 'Mode 2' ? 'secondary' : 'info'}
                                    size="small"
                                    icon={mode === 'Mode 1' ? <SensorsIcon /> : <TvIcon />}
                                    sx={{
                                        fontSize: viewMode === 'mini' ? '0.6rem' : '0.7rem',
                                        height: viewMode === 'mini' ? 18 : 22
                                    }}
                                />
                            ))
                        ) : (
                            <Chip
                                label="No modes active"
                                size="small"
                                sx={{
                                    fontSize: viewMode === 'mini' ? '0.6rem' : '0.7rem',
                                    height: viewMode === 'mini' ? 18 : 22
                                }}
                            />
                        )}
                    </Box>
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
                    <Tooltip title="Edit">
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(e, device);
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
                    <Tooltip title="Delete">
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(e, device.id);
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
            </Box>
        </Card>
    );
});

VirtualDeviceCard.displayName = 'VirtualDeviceCard';

export default VirtualDeviceCard;
