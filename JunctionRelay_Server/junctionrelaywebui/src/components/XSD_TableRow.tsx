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

import React, { memo, useCallback } from "react";
import {
    Typography,
    Box,
    Chip,
    Tooltip,
    IconButton,
    TableRow,
    TableCell,
} from "@mui/material";
// Icon imports
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ComputerIcon from '@mui/icons-material/Computer';
import type { Device } from '../types/entities';

interface XSDColumn {
    field: string;
    label: string;
    align: "left" | "right" | "center" | "inherit" | "justify";
    sortable?: boolean;
}

// Memoized TableRow component
const XSDTableRow = memo(({
    device,
    visibleCols,
    allColumns,
    onDelete,
    onEdit,
    onCardClick,
    id,
}: {
    device: Device,
    visibleCols: string[],
    allColumns: XSDColumn[],
    onDelete: (e: React.MouseEvent, id: number) => void,
    onEdit: (e: React.MouseEvent, device: Device) => void,
    onCardClick?: () => void,
    id?: string,
}) => {
    const handleRowClick = () => {
        if (onCardClick) {
            onCardClick();
        }
    };

    const getDeviceCell = useCallback((field: string) => {
        switch (field) {
            case "name":
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <ComputerIcon fontSize="small" />
                        <Typography fontWeight="medium" color="text.primary">
                            {device.name}
                        </Typography>
                    </Box>
                );
            case "ipAddress":
                return device.ipAddress || "—";
            case "port":
                return device.webSocketPort || "—";
            case "status":
                const status = device.status || 'Unknown';
                let statusColor: "default" | "success" | "error" | "warning" = 'default';

                if (status === 'Connected') {
                    statusColor = 'success';
                } else if (status === 'Disconnected' || status === 'Error') {
                    statusColor = 'error';
                } else if (status === 'Warning') {
                    statusColor = 'warning';
                }

                return (
                    <Chip
                        label={status}
                        color={statusColor}
                        size="small"
                        sx={{ fontSize: '0.75rem', height: 22, fontWeight: 'bold' }}
                    />
                );
            case "lastHeartbeat":
                // The server sends no heartbeat time for XSD devices (Model_Device has none)
                return "—";
            case "actions":
                return (
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(e, device);
                                }}
                                sx={{
                                    padding: '6px',
                                    border: '1px solid',
                                    borderColor: 'primary.main',
                                    color: 'primary.main',
                                    '&:hover': {
                                        backgroundColor: 'primary.main',
                                        color: 'primary.contrastText'
                                    }
                                }}
                            >
                                <EditIcon sx={{ fontSize: '1rem' }} />
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
                                    padding: '6px',
                                    border: '1px solid',
                                    borderColor: 'error.main',
                                    color: 'error.main',
                                    '&:hover': {
                                        backgroundColor: 'error.main',
                                        color: 'error.contrastText'
                                    }
                                }}
                            >
                                <DeleteIcon sx={{ fontSize: '1rem' }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            default:
                return "—";
        }
    }, [device, onDelete, onEdit]);

    return (
        <TableRow
            hover
            onClick={handleRowClick}
            sx={{
                cursor: 'pointer',
                '&:hover': {
                    backgroundColor: 'action.hover',
                },
            }}
            id={id}
        >
            {visibleCols.map((field) => {
                const colDef = allColumns.find((c) => c.field === field);
                if (!colDef) return null;

                return (
                    <TableCell
                        key={field}
                        align={colDef.align}
                        sx={{
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
});

XSDTableRow.displayName = 'XSDTableRow';

export default XSDTableRow;
