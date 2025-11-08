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

import React, { memo } from 'react';
import {
    Box,
    Typography,
    Chip,
    Card,
    CardContent,
    Divider,
    Tooltip,
    IconButton,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
// Icon imports
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RouterIcon from '@mui/icons-material/Router';
import ApiIcon from '@mui/icons-material/Api';
import DashboardIcon from '@mui/icons-material/Dashboard';

// Helper function to get service type info with colors and icons
const getServiceTypeInfo = (type: string) => {
    const typeMap: Record<string, { color: "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error", icon: React.ReactNode }> = {
        "MQTT Broker": { color: "error", icon: <RouterIcon fontSize="small" /> },
        "HomeAssistant": { color: "success", icon: <DashboardIcon fontSize="small" /> },
        "Grafana": { color: "warning", icon: <ApiIcon fontSize="small" /> },
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
                                onEdit(e, service);
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
                                onDelete(e, service.id);
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
});

export default ServiceCard;