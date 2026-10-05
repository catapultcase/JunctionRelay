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
import { useNavigate } from "react-router-dom";
// Icon imports
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import BiotechIcon from '@mui/icons-material/Biotech';
import { CATEGORY_CHIP_COLORS, type ColumnDefinition } from '@junctionrelay/styles';
import type { CollectorMetadata } from '../types/CollectorMetadata';
import type { Collector } from '../types/entities';

// Helper function to extract base URL from Sonarr iCal feed URL
const extractSonarrBaseUrl = (icalFeedUrl: string | null | undefined): string => {
    if (!icalFeedUrl) return "";

    try {
        const url = new URL(icalFeedUrl);
        return `${url.protocol}//${url.host}`;
    } catch {
        return "";
    }
};

// Memoized TableRow component
const CollectorTableRow = memo(({
    collector,
    visibleCols,
    allColumns,
    onDelete,
    onEdit,
    onTest,
    isFrameEngine = false,
    onCardClick,
    id,
    metadata,
}: {
    collector: Collector,
    visibleCols: string[],
    allColumns: ColumnDefinition<string>[],
    onDelete: (e: React.MouseEvent, id: number) => void,
    onEdit: (e: React.MouseEvent, collector: Collector) => void,
    onTest?: (e: React.MouseEvent, id: number) => void,
    isFrameEngine?: boolean,
    onCardClick?: () => void,
    id?: string,
    metadata?: CollectorMetadata,
}) => {
    const navigate = useNavigate();

    const handleRowClick = () => {
        if (isFrameEngine && onCardClick) {
            onCardClick();
        } else {
            navigate(`/configure-collector/${collector.id}`);
        }
    };

    const emoji = metadata?.emoji || '⚙️';
    const chipColor = metadata ? (CATEGORY_CHIP_COLORS[metadata.category] || 'default') : 'default';

    const getCollectorCell = useCallback((field: string) => {
        switch (field) {
            case "name":
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span style={{ fontSize: '1.1rem' }}>{emoji}</span>
                        <Typography fontWeight="medium" color="text.primary">
                            {collector.name}
                        </Typography>
                    </Box>
                );
            case "type":
                return (
                    <Chip
                        label={metadata?.displayName || collector.collectorType}
                        color={chipColor}
                        size="small"
                        sx={{ fontSize: '0.75rem', height: 22 }}
                    />
                );
            case "category":
                return (
                    <Typography variant="body2" color="text.secondary">
                        {metadata?.category || '—'}
                    </Typography>
                );
            case "url":
                // Handle Sonarr special case - show base URL or "iCal Feed"
                if (collector.collectorType === 'SonarrCalendar') {
                    const baseUrl = collector.url || extractSonarrBaseUrl(collector.accessToken);
                    return baseUrl || "iCal Feed";
                }
                return collector.url || "—";
            case "accessToken":
                // Use the accessTokenStatus from backend if available, otherwise fall back to old logic
                return collector.accessTokenStatus || (collector.accessToken ? "********" : "Not set");
            case "securityStatus":
                // Show security status with color coding
                const securityStatus = collector.securityStatus || 'Unlocked';
                const securityColor = securityStatus === 'Locked' ? 'warning' : 'default';
                return (
                    <Chip
                        label={securityStatus}
                        color={securityColor}
                        size="small"
                    />
                );
            case "status":
                // Determine status color based on value
                let statusColor: "default" | "success" | "error" | "warning" = 'default';
                const status = collector.status || 'Unknown';

                if (status === 'Active' || status === 'Tested') {
                    statusColor = 'success';
                } else if (status === 'Inactive' || status === 'Error') {
                    statusColor = 'error';
                } else if (status === 'Warning') {
                    statusColor = 'warning';
                }

                return (
                    <Chip
                        label={status}
                        color={statusColor}
                        size="small"
                    />
                );
            case "sensorCount":
                return (
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {collector.addedSensorCount ?? '—'}
                    </Typography>
                );
            case "lastTested":
                // Format the last tested timestamp
                if (!collector.lastTested) {
                    return <Typography variant="body2" color="text.secondary">Never</Typography>;
                }
                const lastTestedDate = new Date(collector.lastTested + 'Z');
                return (
                    <Tooltip title={lastTestedDate.toLocaleString()}>
                        <Typography variant="body2">
                            {lastTestedDate.toLocaleDateString()} {lastTestedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                    </Tooltip>
                );
            case "actions":
                // Hide edit/delete buttons for FrameEngine collectors
                if (isFrameEngine) {
                    return (
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                                Managed by EventEngine
                            </Typography>
                        </Box>
                    );
                }

                return (
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        {onTest && (
                            <Tooltip title="Test Connection">
                                <IconButton
                                    size="small"
                                    onClick={(e) => onTest(e, collector.id)}
                                    color="secondary"
                                >
                                    <BiotechIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip title="Edit">
                            <IconButton
                                size="small"
                                onClick={(e) => onEdit(e, collector)}
                                data-collector-id={collector.id}
                                data-action="edit"
                            >
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                            <IconButton
                                size="small"
                                onClick={(e) => onDelete(e, collector.id)}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            default:
                return "—";
        }
    }, [collector, onDelete, onEdit, onTest, isFrameEngine, emoji, chipColor, metadata]);

    return (
        <TableRow
            hover
            onClick={handleRowClick}
            sx={{ cursor: "pointer" }}
            id={id}
        >
            {visibleCols.map((field) => {
                const colDef = allColumns.find((c) => c.field === field);
                if (!colDef) return null;

                const getColumnWidth = (field: string) => {
                    switch (field) {
                        case "name":
                            return { minWidth: 200, width: 'auto' };
                        case "type":
                            return { minWidth: 120, width: 120 };
                        case "url":
                            return { minWidth: 200, width: 'auto' };
                        case "category":
                            return { minWidth: 140, width: 140 };
                        case "accessToken":
                        case "securityStatus":
                            return { minWidth: 100, width: 100 };
                        case "status":
                            return { minWidth: 100, width: 100 };
                        case "sensorCount":
                            return { minWidth: 80, width: 80 };
                        case "lastTested":
                            return { minWidth: 160, width: 160 };
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
                        {getCollectorCell(field)}
                    </TableCell>
                );
            })}
        </TableRow>
    );
});

CollectorTableRow.displayName = 'CollectorTableRow';

export default CollectorTableRow;