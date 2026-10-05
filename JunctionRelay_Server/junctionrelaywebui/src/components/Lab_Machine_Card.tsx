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
    Card,
    CardContent,
    Typography,
    Box,
    Chip,
    Tooltip,
    IconButton,
    Badge,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import BoltIcon from '@mui/icons-material/Bolt';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import { CARD_STYLES, getCardBaseSx, getCardContentSx, getIconButtonSx } from '@junctionrelay/styles';
import { type LabMachine, getMachineStatusInfo, getMajorComponentChips, machineEmoji } from './Lab_Machines_Helpers';

const LabMachineCard = memo(({
    machine,
    viewMode,
    onDelete,
    onEdit,
    onRetire,
}: {
    machine: LabMachine,
    viewMode: 'standard' | 'mini',
    onDelete: (e: React.MouseEvent, id: number) => void,
    onEdit: (e: React.MouseEvent, machine: LabMachine) => void,
    onRetire: (machine: LabMachine) => void,
}) => {
    const navigate = useNavigate();
    const cfg = CARD_STYLES[viewMode];
    const statusInfo = getMachineStatusInfo(machine.status);
    const isStandard = viewMode === 'standard';

    return (
        <Card
            variant="outlined"
            onClick={() => navigate(`/homelab/configure-machine/${machine.id}`)}
            sx={{ ...getCardBaseSx(viewMode), cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
        >
            {/* Emoji thumbnail (plugin-instance card pattern) */}
            <Box
                sx={{
                    height: isStandard ? 153 : 108,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'action.hover',
                    borderBottom: 1,
                    borderColor: 'divider',
                }}
            >
                <Typography sx={{ fontSize: isStandard ? '3.5rem' : '2.5rem', opacity: 0.7 }}>
                    {machineEmoji(machine)}
                </Typography>
            </Box>
            <CardContent sx={getCardContentSx(viewMode)}>
                <Typography variant={cfg.title.variant} sx={cfg.title.sx}>
                    {machine.name}
                </Typography>

                <Box sx={{ display: 'flex', gap: isStandard ? 1 : 0.5, alignItems: 'center', mb: 1, flexWrap: 'wrap' }}>
                    <Chip
                        label={statusInfo.label}
                        color={statusInfo.color}
                        variant="outlined"
                        size="small"
                        sx={{ height: cfg.chip.height, fontSize: cfg.chip.fontSize }}
                    />
                    {machine.role && (
                        <Chip
                            label={machine.role}
                            size="small"
                            sx={{ height: cfg.chip.height, fontSize: cfg.chip.fontSize }}
                        />
                    )}
                </Box>

                {isStandard && (
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mb: 1, flexWrap: 'wrap', minHeight: 24 }}>
                        {getMajorComponentChips(machine).map((label) => (
                            <Chip
                                key={label}
                                label={label}
                                size="small"
                                sx={{ height: cfg.chip.height, fontSize: cfg.chip.fontSize, maxWidth: 170 }}
                            />
                        ))}
                    </Box>
                )}
                {isStandard && (
                    <Box sx={{ mb: 1, minHeight: 20 }}>
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize: '0.85rem' }}>
                            {[machine.os, machine.ipAddress].filter(Boolean).join(' · ') || ' '}
                        </Typography>
                    </Box>
                )}

                {/* Bottom row: info left, actions right */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 'auto' }}>
                    <Box sx={{ display: 'flex', gap: cfg.buttonGap, alignItems: 'center' }}>
                        {machine.alwaysOn && (
                            <Tooltip title="Always on (24/7)">
                                <IconButton
                                    size="small"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                    sx={getIconButtonSx('warning', viewMode)}
                                >
                                    <BoltIcon sx={{ fontSize: cfg.iconButton.iconSize }} />
                                </IconButton>
                            </Tooltip>
                        )}
                        {machine.componentCount > 0 && (
                            <Tooltip title={`${machine.componentCount} component${machine.componentCount === 1 ? '' : 's'} installed`}>
                                <Badge badgeContent={machine.componentCount} color="success">
                                    <IconButton
                                        size="small"
                                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                        sx={getIconButtonSx('success', viewMode)}
                                    >
                                        <AccountTreeIcon sx={{ fontSize: cfg.iconButton.iconSize }} />
                                    </IconButton>
                                </Badge>
                            </Tooltip>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: cfg.buttonGap, alignItems: 'center' }}>
                        <Tooltip title="Edit machine">
                            <IconButton
                                size="small"
                                onClick={(e) => { e.stopPropagation(); onEdit(e, machine); }}
                                sx={getIconButtonSx('primary', viewMode)}
                            >
                                <EditIcon sx={{ fontSize: cfg.iconButton.iconSize }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={machine.status === 'retired' ? 'Reactivate machine' : 'Retire machine (keeps history)'}>
                            <IconButton
                                size="small"
                                onClick={(e) => { e.stopPropagation(); onRetire(machine); }}
                                sx={getIconButtonSx('warning', viewMode)}
                            >
                                {machine.status === 'retired' ? <UnarchiveIcon sx={{ fontSize: cfg.iconButton.iconSize }} /> : <ArchiveIcon sx={{ fontSize: cfg.iconButton.iconSize }} />}
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete machine (components move to shelf)">
                            <IconButton
                                size="small"
                                onClick={(e) => { e.stopPropagation(); onDelete(e, machine.id); }}
                                sx={getIconButtonSx('error', viewMode)}
                            >
                                <DeleteIcon sx={{ fontSize: cfg.iconButton.iconSize }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
});

LabMachineCard.displayName = 'LabMachineCard';

export default LabMachineCard;
