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

import React, { memo, useCallback } from 'react';
import {
    Box,
    Typography,
    Chip,
    TableRow,
    TableCell,
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

interface ServiceColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    sortable?: boolean;
}

// Helper function to get service type info with colors and icons
const getServiceTypeInfo = (type: string) => {
    const typeMap: Record<string, { color: "default" | "primary" | "secondary" | "success" | "info" | "warning" | "error", icon: React.ReactNode }> = {
        "MQTT Broker": { color: "error", icon: <RouterIcon fontSize="small" /> },
        "HomeAssistant": { color: "success", icon: <DashboardIcon fontSize="small" /> },
        "Grafana": { color: "warning", icon: <ApiIcon fontSize="small" /> },
    };

    return typeMap[type] || { color: "default" as const, icon: <ApiIcon fontSize="small" /> };
};

// Memoized TableRow component
const ServiceTableRow = memo(({
    service,
    visibleCols,
    allColumns,
    onDelete,
    onEdit,
}: {
    service: any,
    visibleCols: string[],
    allColumns: ServiceColumn[],
    onDelete: (e: React.MouseEvent, id: number) => void,
    onEdit: (e: React.MouseEvent, service: any) => void,
}) => {
    const navigate = useNavigate();

    const getServiceCell = useCallback((field: string) => {
        switch (field) {
            case "name":
                const typeInfo = getServiceTypeInfo(service.type);
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {typeInfo.icon}
                        <Typography fontWeight="medium" color="text.primary">
                            {service.name}
                        </Typography>
                    </Box>
                );
            case "type":
                const typeInfoChip = getServiceTypeInfo(service.type);
                return (
                    <Chip
                        label={service.type}
                        color={typeInfoChip.color}
                        size="small"
                        sx={{ fontSize: '0.75rem', height: 22 }}
                    />
                );
            case "description":
                return service.description || "-";
            case "uniqueIdentifier":
                return service.uniqueIdentifier || "-";
            case "status":
                const statusColor = service.status === 'Active' ? 'success' :
                    service.status === 'Inactive' ? 'error' : 'default';
                return (
                    <Chip
                        label={service.status || 'Unknown'}
                        color={statusColor}
                        size="small"
                    />
                );
            case "actions":
                return (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={(e) => onEdit(e, service)}
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                onClick={(e) => onDelete(e, service.id)}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            default:
                return service[field] || "-";
        }
    }, [service, onDelete, onEdit]);

    return (
        <TableRow
            hover
            onClick={() => navigate(`/configure-service/${service.id}`)}
            sx={{ cursor: "pointer" }}
        >
            {visibleCols.map((field) => {
                const colDef = allColumns.find((c) => c.field === field)!;

                const getColumnWidth = (field: string) => {
                    switch (field) {
                        case "name":
                            return { minWidth: 200, width: 'auto' };
                        case "type":
                            return { minWidth: 120, width: 120 };
                        case "description":
                            return { minWidth: 200, width: 'auto' };
                        case "uniqueIdentifier":
                            return { minWidth: 180, width: 'auto' };
                        case "status":
                            return { minWidth: 100, width: 100 };
                        case "actions":
                            return { minWidth: 120, width: 120 };
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
                        {getServiceCell(field)}
                    </TableCell>
                );
            })}
        </TableRow>
    );
});

export default ServiceTableRow;