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
import { useNavigate } from "react-router-dom";
// Icon imports
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BiotechIcon from '@mui/icons-material/Biotech';
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
import TvIcon from '@mui/icons-material/Tv';

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
        "SonarrCalendar": { color: "secondary", icon: <TvIcon fontSize="small" /> },
        "Stripe": { color: "success", icon: <PaymentIcon fontSize="small" /> },
        "UptimeKuma": { color: "success", icon: <MonitorHeartIcon fontSize="small" /> },
        "FrameEngine": { color: "warning", icon: <MemoryIcon fontSize="small" /> },
    };

    return typeMap[type] || { color: "default" as const, icon: <DnsIcon fontSize="small" /> };
};

// Helper function to extract base URL from Sonarr iCal feed URL
const extractSonarrBaseUrl = (icalFeedUrl: string): string => {
    if (!icalFeedUrl) return "";

    try {
        const url = new URL(icalFeedUrl);
        return `${url.protocol}//${url.host}`;
    } catch {
        return "";
    }
};

// Memoized Collector Card component for tile views
const CollectorCard = memo(({
    collector,
    viewMode,
    onDelete,
    onEdit,
    onTest,
    isFrameEngine = false,
    onCardClick,
}: {
    collector: any,
    viewMode: 'standard' | 'mini',
    onDelete: (e: React.MouseEvent, id: number) => void,
    onEdit: (e: React.MouseEvent, collector: any) => void,
    onTest?: (e: React.MouseEvent, id: number) => void,
    isFrameEngine?: boolean,
    onCardClick?: () => void,
}) => {
    const navigate = useNavigate();
    const typeInfo = getCollectorTypeInfo(collector.collectorType);

    const handleCardClick = () => {
        if (isFrameEngine && onCardClick) {
            onCardClick();
        } else {
            navigate(`/configure-collector/${collector.id}`);
        }
    };

    const getCardHeight = () => {
        return viewMode === 'mini' ? 120 : 220;
    };

    // Determine status color
    let statusColor: "default" | "success" | "error" | "warning" = 'default';
    const status = collector.status || 'Unknown';

    if (status === 'Active' || status === 'Tested') {
        statusColor = 'success';
    } else if (status === 'Inactive' || status === 'Error') {
        statusColor = 'error';
    } else if (status === 'Warning') {
        statusColor = 'warning';
    }

    // Get display URL based on collector type
    const getDisplayUrl = () => {
        if (collector.collectorType === 'SonarrCalendar') {
            // For Sonarr, show the base URL extracted from the access token, or fall back to stored URL
            return collector.url || extractSonarrBaseUrl(collector.accessToken) || "Sonarr iCal Feed";
        }
        return collector.url;
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
                            {getDisplayUrl() && (
                                <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                    <strong>URL:</strong> {getDisplayUrl()}
                                </Typography>
                            )}
                            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.8rem' }}>
                                <strong>Token:</strong> {collector.accessTokenStatus || (collector.accessToken ? "Configured" : "Not set")}
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
                            label={
                                viewMode === 'mini'
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
            </CardContent>

            {/* Action Buttons at Bottom - Outside CardContent - Hidden for FrameEngine */}
            {!isFrameEngine && (
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
                                    onEdit(e, collector);
                                }}
                                data-collector-id={collector.id}
                                data-action="edit"
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
                                    onDelete(e, collector.id);
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

                    {/* Right side: Primary action (Test) */}
                    <Box sx={{ display: 'flex', gap: viewMode === 'mini' ? 0.5 : 1 }}>
                        {onTest && (
                            <Tooltip title="Test Connection">
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onTest(e, collector.id);
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
                                    <BiotechIcon sx={{ fontSize: viewMode === 'mini' ? '0.9rem' : '1rem' }} />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                </Box>
            )}

            {/* Special notice for FrameEngine in standard view */}
            {viewMode === 'standard' && isFrameEngine && (
                <Box sx={{
                    p: 1,
                    pt: 0
                }}>
                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        p: 1,
                        backgroundColor: 'action.hover',
                        borderRadius: 1
                    }}>
                        <Typography variant="caption" color="text.secondary" align="center">
                            Managed by EventEngine
                        </Typography>
                    </Box>
                </Box>
            )}
        </Card>
    );
});

CollectorCard.displayName = 'CollectorCard';

export default CollectorCard;