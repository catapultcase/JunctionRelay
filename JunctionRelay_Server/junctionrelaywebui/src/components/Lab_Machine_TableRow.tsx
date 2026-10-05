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
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import { type ColumnDefinition } from '@junctionrelay/styles';
import { type LabMachine, getMachineStatusInfo, machineEmoji } from './Lab_Machines_Helpers';

const LabMachineTableRow = memo(({
    machine,
    visibleCols,
    allColumns,
    onDelete,
    onEdit,
    onRetire,
}: {
    machine: LabMachine,
    visibleCols: string[],
    allColumns: ColumnDefinition<string>[],
    onDelete: (e: React.MouseEvent, id: number) => void,
    onEdit: (e: React.MouseEvent, machine: LabMachine) => void,
    onRetire: (machine: LabMachine) => void,
}) => {
    const navigate = useNavigate();

    const handleRowClick = () => {
        navigate(`/homelab/configure-machine/${machine.id}`);
    };

    const getMachineCell = useCallback((field: string) => {
        switch (field) {
            case "name":
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span style={{ fontSize: '1.1rem' }}>{machineEmoji(machine)}</span>
                        <Box>
                            <Typography fontWeight="medium" color="text.primary">
                                {machine.name}
                            </Typography>
                            {machine.hostname && machine.hostname !== machine.name && (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                    {machine.hostname}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                );
            case "role":
                return (
                    <Typography variant="body2" color="text.secondary">
                        {machine.role || '—'}
                    </Typography>
                );
            case "status": {
                const statusInfo = getMachineStatusInfo(machine.status);
                return (
                    <Chip
                        label={statusInfo.label}
                        color={statusInfo.color}
                        size="small"
                        variant="outlined"
                    />
                );
            }
            case "os":
                return machine.os || '—';
            case "ipAddress":
                return machine.ipAddress || '—';
            case "location":
                return machine.location || '—';
            case "updatedAt":
                return (
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                        {machine.updatedAt ? new Date(machine.updatedAt).toLocaleString() : '—'}
                    </Typography>
                );
            case "componentCount":
                if (!machine.componentCount) {
                    return <Typography variant="caption" color="text.secondary">{'—'}</Typography>;
                }
                return (
                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                        {machine.componentCount}
                    </Typography>
                );
            case "actions":
                return (
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title="Edit machine">
                            <IconButton size="small" color="primary" onClick={(e) => { e.stopPropagation(); onEdit(e, machine); }}>
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={machine.status === 'retired' ? 'Reactivate machine' : 'Retire machine (keeps history)'}>
                            <IconButton size="small" color="warning" onClick={(e) => { e.stopPropagation(); onRetire(machine); }}>
                                {machine.status === 'retired' ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete machine (components move to shelf)">
                            <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); onDelete(e, machine.id); }}>
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                );
            default:
                return null;
        }
    }, [machine, onDelete, onEdit, onRetire]);

    return (
        <TableRow
            hover
            onClick={handleRowClick}
            sx={{ cursor: 'pointer' }}
        >
            {visibleCols.map((field) => {
                const colDef = allColumns.find((c) => c.field === field)!;
                return (
                    <TableCell key={field} align={colDef.align} sx={{ padding: '8px 16px' }}>
                        {getMachineCell(field)}
                    </TableCell>
                );
            })}
        </TableRow>
    );
});

LabMachineTableRow.displayName = 'LabMachineTableRow';

export default LabMachineTableRow;
