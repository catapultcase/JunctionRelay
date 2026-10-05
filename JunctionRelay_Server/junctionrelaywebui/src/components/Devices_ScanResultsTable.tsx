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

import React, { memo, useMemo, useState } from "react";
import {
    Box, Chip, CircularProgress, IconButton, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, TableSortLabel, ToggleButton, ToggleButtonGroup, Tooltip, Typography
} from "@mui/material";
import TableViewIcon from '@mui/icons-material/TableView';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import SyncIcon from '@mui/icons-material/Sync';
import { getDeviceStatusInfo } from './Devices_Helpers';
import ScanResultCard from './Devices_ScanResultCard';
import type { DeviceInfo } from '../types/entities';
import type { ScannedDevice, ViewMode } from '../types/devices';

// The devices a scan found, as a table or as tiles. Scan results are not registered devices: no nesting,
// no column picker, nothing to edit - only resync an existing device or pick a new one to add.

type ScanColumn = 'name' | 'type' | 'ipAddress' | 'macAddress' | 'model' | 'firmware' | 'status' | 'actions';
const COLUMNS: { field: ScanColumn; label: string; sortable: boolean }[] = [
    { field: 'name', label: 'Name', sortable: true },
    { field: 'type', label: 'Type', sortable: true },
    { field: 'ipAddress', label: 'IP / Port', sortable: true },
    { field: 'macAddress', label: 'MAC', sortable: true },
    { field: 'model', label: 'Model', sortable: true },
    { field: 'firmware', label: 'Firmware', sortable: true },
    { field: 'status', label: 'Status', sortable: true },
    { field: 'actions', label: 'Actions', sortable: false },
];

interface ScanResultsTableProps {
    devices: ScannedDevice[];
    title: string;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    deviceDetails: Record<string, DeviceInfo>;
    loadingDetails: Set<string>;
    onResync?: (macAddress: string, ipAddress: string) => void;
    resyncingDevices?: { [macIp: string]: boolean };
    resyncedDevices?: Set<string>;
    onSelect?: (device: ScannedDevice) => void;
}

/** A column's sort and display value; COM results carry model and firmware themselves, network ones in their details. */
const cellText = (device: ScannedDevice, field: ScanColumn, details?: DeviceInfo): string => {
    switch (field) {
        case 'name': return device.instance || 'Unknown Device';
        case 'type': return device.type || (device.isJunctionRelayDevice ? 'JunctionRelay' : 'Network device');
        case 'ipAddress': return device.portName || device.ipAddress || '';
        case 'macAddress': return device.macAddress || '';
        case 'model': return device.deviceModel || details?.deviceModel || '';
        case 'firmware': return device.firmwareVersion || details?.firmwareVersion || '';
        case 'status': return device.status;
        default: return '';
    }
};

const ResyncButton = ({ device, resyncing, onResync }: { device: ScannedDevice; resyncing: boolean; onResync: (mac: string, ip: string) => void }) => (
    <Tooltip title="Resync Device">
        <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onResync(device.macAddress, device.ipAddress); }}
            disabled={resyncing}
        >
            {resyncing ? <CircularProgress size={16} /> : <SyncIcon fontSize="small" />}
        </IconButton>
    </Tooltip>
);

const ScanResultRow = memo(({ device, details, loading, resyncing, canResync, onResync, onSelect }: {
    device: ScannedDevice;
    details?: DeviceInfo;
    loading: boolean;
    resyncing: boolean;
    canResync: boolean;
    onResync?: (mac: string, ip: string) => void;
    onSelect?: (device: ScannedDevice) => void;
}) => {
    const statusInfo = getDeviceStatusInfo(device.status);
    return (
        <TableRow hover onClick={onSelect ? () => onSelect(device) : undefined} sx={{ cursor: 'default' }}>
            {COLUMNS.map(({ field }) => (
                <TableCell key={field} sx={{ whiteSpace: 'nowrap', padding: '8px 16px' }}>
                    {field === 'status' ? <Chip label={statusInfo.label} color={statusInfo.color} size="small" />
                        : field === 'actions' ? (canResync && onResync ? <ResyncButton device={device} resyncing={resyncing} onResync={onResync} /> : null)
                        : (field === 'model' || field === 'firmware') && loading && !cellText(device, field, details) ? <CircularProgress size={12} />
                        : cellText(device, field, details) || '—'}
                </TableCell>
            ))}
        </TableRow>
    );
});

const ScanResultsTable: React.FC<ScanResultsTableProps> = ({
    devices, title, viewMode, onViewModeChange, deviceDetails, loadingDetails, onResync, resyncingDevices, resyncedDevices, onSelect,
}) => {
    const [sort, setSort] = useState<{ field: ScanColumn; order: 'asc' | 'desc' }>({ field: 'name', order: 'asc' });

    const sorted = useMemo(() => {
        const key = (d: ScannedDevice) => cellText(d, sort.field, deviceDetails[d.ipAddress]).toLowerCase();
        const direction = sort.order === 'asc' ? 1 : -1;
        return [...devices].sort((a, b) => key(a).localeCompare(key(b)) * direction);
    }, [devices, sort, deviceDetails]);

    const requestSort = (field: ScanColumn) =>
        setSort(prev => ({ field, order: prev.field === field && prev.order === 'asc' ? 'desc' : 'asc' }));

    const rowState = (d: ScannedDevice) => ({
        details: deviceDetails[d.ipAddress],
        loading: loadingDetails.has(d.ipAddress),
        resyncing: !!resyncingDevices?.[`${d.macAddress}-${d.ipAddress}`],
        canResync: d.status !== 'DEVICE_EXISTS' && !!onResync && !(resyncedDevices?.has(d.macAddress) ?? false),
    });

    const gridColumns = viewMode === 'mini'
        ? { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(6, 1fr)' }
        : { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' };

    return (
        <Box sx={{ mb: 4 }}>
            <Box display="flex" alignItems="center" mb={1} flexWrap="wrap" gap={2}>
                <Typography variant="h6">{title}</Typography>
                <ToggleButtonGroup
                    value={viewMode}
                    exclusive
                    onChange={(_, mode: ViewMode | null) => { if (mode) onViewModeChange(mode); }}
                    aria-label="view mode"
                    size="small"
                    sx={{ ml: 'auto' }}
                >
                    <ToggleButton value="table" aria-label="table view"><TableViewIcon /><Typography variant="caption" sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>Table</Typography></ToggleButton>
                    <ToggleButton value="standard" aria-label="standard tiles"><DashboardIcon /><Typography variant="caption" sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>Standard</Typography></ToggleButton>
                    <ToggleButton value="mini" aria-label="mini tiles"><ViewModuleIcon /><Typography variant="caption" sx={{ ml: 0.5, display: { xs: 'none', sm: 'inline' } }}>Mini</Typography></ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {viewMode === 'table' ? (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                {COLUMNS.map(col => (
                                    <TableCell key={col.field} sx={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                        {col.sortable ? (
                                            <TableSortLabel
                                                active={sort.field === col.field}
                                                direction={sort.field === col.field ? sort.order : 'asc'}
                                                onClick={() => requestSort(col.field)}
                                            >
                                                {col.label}
                                            </TableSortLabel>
                                        ) : col.label}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sorted.length > 0 ? sorted.map(d => (
                                <ScanResultRow key={`${d.macAddress}-${d.ipAddress}`} device={d} onResync={onResync} onSelect={onSelect} {...rowState(d)} />
                            )) : (
                                <TableRow>
                                    <TableCell colSpan={COLUMNS.length} sx={{ textAlign: 'center', py: 3 }}>
                                        <Typography color="textSecondary">No devices found in scan</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: gridColumns, gap: viewMode === 'mini' ? 1 : 2 }}>
                    {sorted.length > 0 ? sorted.map(d => {
                        const state = rowState(d);
                        return (
                            <ScanResultCard
                                key={`${d.macAddress}-${d.ipAddress}`}
                                device={d}
                                viewMode={viewMode}
                                details={state.details}
                                loadingDetails={state.loading}
                                resyncing={state.resyncing}
                                resynced={!state.canResync}
                                onResync={onResync}
                                onClick={onSelect}
                            />
                        );
                    }) : (
                        <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                            <Typography color="textSecondary">No devices found in scan</Typography>
                        </Paper>
                    )}
                </Box>
            )}
        </Box>
    );
};

export default ScanResultsTable;
