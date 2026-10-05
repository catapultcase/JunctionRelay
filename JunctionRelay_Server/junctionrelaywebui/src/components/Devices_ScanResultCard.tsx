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

import { memo } from "react";
import { Typography, Box, CircularProgress, Tooltip, IconButton, Card, CardContent, Divider } from "@mui/material";
import MemoryIcon from '@mui/icons-material/Memory';
import SyncIcon from '@mui/icons-material/Sync';
import { getDeviceStatusInfo } from './Devices_Helpers';
import type { DeviceInfo } from '../types/entities';
import type { ScannedDevice } from '../types/devices';

interface ScanResultCardProps {
    device: ScannedDevice;
    viewMode: 'standard' | 'mini';
    details?: DeviceInfo;
    loadingDetails: boolean;
    resyncing: boolean;
    resynced: boolean;
    onResync?: (macAddress: string, ipAddress: string) => void;
    onClick?: (device: ScannedDevice) => void;
}

const detailLine = (label: string, value?: string | null) => value ? (
    <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
        <strong>{label}:</strong> {value}
    </Typography>
) : null;

// A device a network or COM scan found, as a tile.
const ScanResultCard = memo(({ device, viewMode, details, loadingDetails, resyncing, resynced, onResync, onClick }: ScanResultCardProps) => {
    const statusInfo = getDeviceStatusInfo(device.status);
    const mini = viewMode === 'mini';
    const badgeColor = statusInfo.color === 'success' ? 'success' : statusInfo.color === 'warning' ? 'warning' : statusInfo.color === 'info' ? 'info' : null;
    const canResync = device.status !== "DEVICE_EXISTS" && onResync && !resynced;

    return (
        <Card
            variant="outlined"
            sx={{
                cursor: 'default',
                transition: 'all 0.2s ease-in-out',
                position: 'relative',
                minHeight: mini ? 120 : 220,
                display: 'flex',
                flexDirection: 'column',
                '&:hover': { boxShadow: 6, backgroundColor: 'action.hover' },
                border: '1px solid',
                borderColor: device.status === 'NEW_DEVICE' ? 'success.main' : 'divider',
            }}
            onClick={onClick ? () => onClick(device) : undefined}
        >
            {/* Status Badge */}
            <Box
                sx={{
                    position: 'absolute',
                    top: mini ? 4 : 8,
                    right: mini ? 4 : 8,
                    backgroundColor: badgeColor ? `${badgeColor}.main` : 'grey.400',
                    color: badgeColor ? `${badgeColor}.contrastText` : 'grey.700',
                    px: mini ? 0.5 : 1.5,
                    py: mini ? 0.25 : 0.5,
                    borderRadius: mini ? 1 : 2,
                    fontSize: mini ? '0.6rem' : '0.75rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    boxShadow: 1,
                    zIndex: 1
                }}
            >
                {mini
                    ? (statusInfo.color === 'success' ? '●' : statusInfo.color === 'info' ? '◆' : statusInfo.color === 'warning' ? '▲' : '○')
                    : statusInfo.label}
            </Box>

            <CardContent sx={{ flex: 1, pt: mini ? 2.5 : 5, p: mini ? 1 : 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: mini ? 0.5 : 1, gap: 0.5 }}>
                    <MemoryIcon fontSize="small" color="action" />
                    <Typography
                        variant={mini ? 'body2' : 'h6'}
                        sx={{ fontSize: mini ? '0.75rem' : { xs: '1rem', sm: '1.1rem' }, fontWeight: 600, lineHeight: mini ? 1.2 : 1.5, flex: 1 }}
                        noWrap
                    >
                        {device.instance || 'Unknown Device'}
                    </Typography>
                </Box>

                {!mini && (
                    <>
                        <Divider sx={{ mb: 1 }} />
                        <Box sx={{ mb: 1 }}>
                            {detailLine('Type', device.type || 'Unknown')}
                            {detailLine('IP', device.ipAddress)}
                            {detailLine('MAC', device.macAddress)}
                            {detailLine('Model', details?.deviceModel)}
                            {detailLine('Firmware', details?.firmwareVersion)}
                        </Box>
                        {loadingDetails && (
                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                                <CircularProgress size={12} sx={{ mr: 1 }} />
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.75rem' }}>
                                    Loading details...
                                </Typography>
                            </Box>
                        )}
                    </>
                )}
            </CardContent>

            {canResync && (
                <Box sx={{ p: mini ? 0.5 : 1, pt: 0, display: 'flex', gap: mini ? 0.5 : 1 }}>
                    <Tooltip title="Resync Device">
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                                onResync(device.macAddress, device.ipAddress);
                            }}
                            disabled={resyncing}
                            sx={{
                                padding: mini ? '4px' : '6px',
                                border: '1px solid',
                                borderColor: 'secondary.main',
                                color: 'secondary.main',
                                '&:hover': { backgroundColor: 'secondary.main', color: 'secondary.contrastText' }
                            }}
                        >
                            {resyncing ? <CircularProgress size={16} /> : <SyncIcon sx={{ fontSize: mini ? '0.9rem' : '1rem' }} />}
                        </IconButton>
                    </Tooltip>
                </Box>
            )}
        </Card>
    );
});

export default ScanResultCard;
