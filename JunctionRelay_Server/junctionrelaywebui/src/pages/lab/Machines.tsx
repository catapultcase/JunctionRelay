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

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Typography,
    Box,
    Paper,
    Button,
    IconButton,
    CircularProgress,
    Snackbar,
    Alert,
    Switch,
    FormControlLabel,
    Tooltip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TableSortLabel,
    ToggleButton,
    ToggleButtonGroup,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    useTheme,
    useMediaQuery,
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import TableViewIcon from '@mui/icons-material/TableView';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import DashboardIcon from '@mui/icons-material/Dashboard';
import SettingsIcon from '@mui/icons-material/Settings';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useColumnVisibility, ColumnPickerPopover, type ColumnDefinition } from '@junctionrelay/styles';
import LabMachineTableRow from '../../components/Lab_Machine_TableRow';
import LabMachineCard from '../../components/Lab_Machine_Card';
import LabMachineAddModal from '../../components/Lab_Machine_AddModal';
import LabMachineGroupDialog, { type MachineGroup, machineFieldValue } from '../../components/Lab_Machine_GroupDialog';
import { type LabMachine, MACHINE_COLUMNS } from '../../components/Lab_Machines_Helpers';
import { errorMessage } from '../../utils/errors';

type ViewMode = 'table' | 'standard' | 'mini';
type SortDirection = 'asc' | 'desc';

const STORAGE_KEY_MACHINES_COLUMNS = "lab_machines_visible_columns";
const STORAGE_KEY_MACHINES_SORT = "lab_machines_sort_state";
const STORAGE_KEY_MACHINES_VIEW_MODE = "lab_machines_view_mode";
const STORAGE_KEY_MACHINES_EXPANDED = "lab_machines_table_expanded";
const STORAGE_KEY_MACHINES_GROUPING = "lab_machines_grouping_enabled";
const STORAGE_KEY_MACHINES_GROUPS_LEGACY = "lab_machines_groups";   // pre-DB storage, migrated on load

/** A row of GET /api/lab/machine-groups (Model_Lab_MachineGroup). */
interface MachineGroupRow {
    id: number;
    name: string;
    field: string;
    rolesJson: string;   // JSON array of the matched values
}

/** The value a machines-table column sorts on. */
const machineSortValue = (m: LabMachine, field: string): string | number | null | undefined => {
    switch (field) {
        case 'name': return m.name;
        case 'hostname': return m.hostname;
        case 'kind': return m.kind;
        case 'role': return m.role;
        case 'status': return m.status;
        case 'os': return m.os;
        case 'ipAddress': return m.ipAddress;
        case 'location': return m.location;
        case 'createdAt': return m.createdAt;
        case 'updatedAt': return m.updatedAt;
        case 'componentCount': return m.componentCount;
        default: return undefined;
    }
};

const HomelabMachines = () => {
    usePageTitle('Homelab Machines');

    const [machines, setMachines] = useState<LabMachine[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingMachine, setEditingMachine] = useState<LabMachine | null>(null);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    // View mode — persisted
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_MACHINES_VIEW_MODE);
        return (stored as ViewMode) || 'table';
    });
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_MACHINES_VIEW_MODE, viewMode);
    }, [viewMode]);

    // Sort state — persisted
    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_MACHINES_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'name', order: 'asc' };
        } catch {
            return { orderBy: 'name', order: 'asc' };
        }
    });
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_MACHINES_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Accordion expansion — persisted, no animation on load
    const [tableExpanded, setTableExpanded] = useState<boolean>(() => {
        const s = localStorage.getItem(STORAGE_KEY_MACHINES_EXPANDED);
        return s !== null ? JSON.parse(s) : true;
    });
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_MACHINES_EXPANDED, JSON.stringify(tableExpanded));
    }, [tableExpanded]);

    // Custom grouping — persisted
    const [groupingEnabled, setGroupingEnabled] = useState<boolean>(() =>
        localStorage.getItem(STORAGE_KEY_MACHINES_GROUPING) === 'true');
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_MACHINES_GROUPING, String(groupingEnabled));
    }, [groupingEnabled]);

    // Groups are DB-backed (Lab_MachineGroups) — ordered by SortOrder
    const [groups, setGroups] = useState<MachineGroup[]>([]);
    const [groupDialogOpen, setGroupDialogOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<MachineGroup | null>(null);

    const parseGroup = (g: MachineGroupRow): MachineGroup => {
        let values: string[] = [];
        try {
            const parsed: unknown = JSON.parse(g.rolesJson || '[]');
            if (Array.isArray(parsed)) values = parsed.filter((v): v is string => typeof v === 'string');
        } catch { /* keep empty */ }
        return { id: g.id, name: g.name, field: g.field || 'role', values };
    };

    const fetchGroups = useCallback(async () => {
        try {
            const response = await fetch('/api/lab/machine-groups');
            if (!response.ok) return;
            let data: MachineGroupRow[] = await response.json();

            // One-time migration of pre-DB groups saved in localStorage
            const legacy = localStorage.getItem(STORAGE_KEY_MACHINES_GROUPS_LEGACY);
            if (data.length === 0 && legacy) {
                try {
                    const legacyGroups: { name: string, roles: string[] }[] = JSON.parse(legacy);
                    for (const g of legacyGroups) {
                        await fetch('/api/lab/machine-groups', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: g.name, field: 'role', rolesJson: JSON.stringify(g.roles) }),
                        });
                    }
                    const refreshed = await fetch('/api/lab/machine-groups');
                    if (refreshed.ok) data = await refreshed.json();
                } catch { /* migration is best-effort */ }
                localStorage.removeItem(STORAGE_KEY_MACHINES_GROUPS_LEGACY);
            }

            setGroups(data.map(parseGroup));
        } catch { /* non-fatal; grouping just shows empty */ }
    }, []);

    // Column visibility — shared hook
    const allColumns = useMemo<ColumnDefinition<string>[]>(() => MACHINE_COLUMNS, []);
    const {
        visibleColumns, orderedColumns, hiddenColumns,
        toggleColumn, moveColumn, resetToDefault,
        anchorEl: colPickerAnchor, openPopover: openColPicker, closePopover: closeColPicker,
    } = useColumnVisibility(STORAGE_KEY_MACHINES_COLUMNS, allColumns);

    const showSnackbar = useCallback((message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    }, []);

    const fetchMachines = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/lab/machines");
            if (!response.ok) throw new Error("Failed to fetch machines");
            setMachines(await response.json());
        } catch (err) {
            showSnackbar("Error fetching machines", "error");
            console.error("Error fetching machines:", err);
        } finally {
            setLoading(false);
        }
    }, [showSnackbar]);

    useEffect(() => {
        fetchMachines();
        fetchGroups();
    }, [fetchMachines, fetchGroups]);

    // Mobile bottom action bar events
    useEffect(() => {
        const handleAdd = () => { setEditingMachine(null); setModalOpen(true); };
        const handleRefresh = () => fetchMachines();
        window.addEventListener('bottom-action-add-machine', handleAdd);
        window.addEventListener('bottom-action-refresh', handleRefresh);
        return () => {
            window.removeEventListener('bottom-action-add-machine', handleAdd);
            window.removeEventListener('bottom-action-refresh', handleRefresh);
        };
    }, [fetchMachines]);

    const handleAddMachine = () => {
        setEditingMachine(null);
        setModalOpen(true);
    };

    const handleEdit = (_e: React.MouseEvent, machine: LabMachine) => {
        setEditingMachine(machine);
        setModalOpen(true);
    };

    const handleDelete = async (_e: React.MouseEvent, id: number) => {
        const machine = machines.find(m => m.id === id);
        const label = machine?.name || `machine ${id}`;
        if (!window.confirm(`Permanently delete ${label}? Its components move to the shelf, but this machine's movement history and attachments are erased. To decommission a real machine and keep its history, set its status to Retired instead.`)) return;
        try {
            const response = await fetch(`/api/lab/machines/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(await response.text());
            showSnackbar(`Deleted ${label}`, "info");
            fetchMachines();
        } catch (err) {
            showSnackbar(`Failed to delete: ${errorMessage(err)}`, "error");
        }
    };

    const handleRetire = async (machine: LabMachine) => {
        const toStatus = machine.status === 'retired' ? 'active' : 'retired';
        try {
            const response = await fetch(`/api/lab/machines/${machine.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...machine, status: toStatus }),
            });
            if (!response.ok) throw new Error(await response.text());
            showSnackbar(`${machine.name} ${toStatus === 'retired' ? 'retired (history preserved)' : 'reactivated'}`, "info");
            fetchMachines();
        } catch (err) {
            showSnackbar(`Failed to update: ${errorMessage(err)}`, "error");
        }
    };

    const handleSaved = (machine: LabMachine) => {
        showSnackbar(`${machine.name} ${editingMachine ? 'updated' : 'added'}`, "success");
        fetchMachines();
    };

    const handleViewModeChange = (_: React.MouseEvent<HTMLElement>, newMode: ViewMode | null) => {
        if (newMode) setViewMode(newMode);
    };

    const handleRequestSort = (field: string) => {
        setSortState(prev => ({
            orderBy: field,
            order: prev.orderBy === field && prev.order === 'asc' ? 'desc' : 'asc',
        }));
    };

    // Group CRUD (DB-backed via api/lab/machine-groups)
    const handleGroupSave = async (g: Omit<MachineGroup, 'id'> & { id?: number }) => {
        try {
            const isEdit = g.id !== undefined;
            const response = await fetch(isEdit ? `/api/lab/machine-groups/${g.id}` : '/api/lab/machine-groups', {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: g.id ?? 0, name: g.name, field: g.field, rolesJson: JSON.stringify(g.values) }),
            });
            if (!response.ok) throw new Error(await response.text());
            fetchGroups();
        } catch (err) {
            showSnackbar(`Failed to save group: ${errorMessage(err)}`, "error");
        }
    };

    const handleGroupDelete = async (id: number) => {
        try {
            const response = await fetch(`/api/lab/machine-groups/${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(await response.text());
            fetchGroups();
        } catch (err) {
            showSnackbar(`Failed to delete group: ${errorMessage(err)}`, "error");
        }
    };

    // Reorder: optimistic local swap, then persist the full order
    const handleGroupMove = async (id: number, direction: -1 | 1) => {
        const index = groups.findIndex(g => g.id === id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= groups.length) return;
        const reordered = [...groups];
        [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
        setGroups(reordered);
        try {
            const response = await fetch('/api/lab/machine-groups/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedIds: reordered.map(g => g.id) }),
            });
            if (!response.ok) throw new Error(await response.text());
        } catch (err) {
            showSnackbar(`Failed to reorder groups: ${errorMessage(err)}`, "error");
            fetchGroups();   // restore server truth
        }
    };

    const sortMachines = useCallback((items: LabMachine[]) => {
        const { orderBy, order } = sortState;
        const dir = order === 'asc' ? 1 : -1;
        return [...items].sort((a, b) => {
            const av = machineSortValue(a, orderBy);
            const bv = machineSortValue(b, orderBy);
            if (typeof av === 'number' || typeof bv === 'number') {
                return ((typeof av === 'number' ? av : 0) - (typeof bv === 'number' ? bv : 0)) * dir;
            }
            return String(av ?? '').toLowerCase().localeCompare(String(bv ?? '').toLowerCase()) * dir;
        });
    }, [sortState]);

    // Grouped view model: each group with its (sorted) members, plus Ungrouped
    const groupedMachines = useMemo(() => {
        if (!groupingEnabled) return null;
        const buckets = groups.map(g => ({
            group: g,
            items: sortMachines(machines.filter(m => g.values.includes(machineFieldValue(m, g.field)))),
        }));
        const groupedIds = new Set(buckets.flatMap(b => b.items.map(m => m.id)));
        const ungrouped = sortMachines(machines.filter(m => !groupedIds.has(m.id)));
        return { buckets, ungrouped };
    }, [groupingEnabled, groups, machines, sortMachines]);

    const sortedMachines = useMemo(() => sortMachines(machines), [machines, sortMachines]);

    // Standard: equal-width cards, max 4 per row; mini keeps compact fixed tiles.
    const getGridColumns = () =>
        viewMode === 'mini'
            ? 'repeat(auto-fit, 192px)'
            : { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' };

    const renderTable = (items: LabMachine[], emptyText: string) => (
        <TableContainer>
            <Table size="small">
                <TableHead>
                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                        {visibleColumns.map((field) => {
                            const colDef = MACHINE_COLUMNS.find((c) => c.field === field)!;
                            return (
                                <TableCell
                                    key={field}
                                    align={colDef.align}
                                    sortDirection={sortState.orderBy === field ? sortState.order : false}
                                    sx={{
                                        fontWeight: 600,
                                        whiteSpace: 'nowrap',
                                        padding: '8px 16px',
                                        ...(colDef.width ? { width: colDef.width } : {}),
                                    }}
                                >
                                    {colDef.sortable !== false ? (
                                        <TableSortLabel
                                            active={sortState.orderBy === field}
                                            direction={sortState.orderBy === field ? sortState.order : 'asc'}
                                            onClick={() => handleRequestSort(field)}
                                        >
                                            {colDef.label}
                                        </TableSortLabel>
                                    ) : (
                                        colDef.label
                                    )}
                                </TableCell>
                            );
                        })}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {items.length > 0 ? (
                        items.map((machine) => (
                            <LabMachineTableRow
                                key={machine.id}
                                machine={machine}
                                visibleCols={visibleColumns}
                                allColumns={MACHINE_COLUMNS}
                                onDelete={handleDelete}
                                onEdit={handleEdit}
                                onRetire={handleRetire}
                            />
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={visibleColumns.length} sx={{ textAlign: 'center', py: 3 }}>
                                <Typography color="textSecondary">{emptyText}</Typography>
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );

    const renderGrid = (items: LabMachine[], emptyText: string) => (
        <Box sx={{ p: 2 }}>
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: getGridColumns(),
                gap: 0.75,
                justifyContent: 'center',
            }}>
                {items.length > 0 ? (
                    items.map((machine) => (
                        <LabMachineCard
                            key={machine.id}
                            machine={machine}
                            viewMode={viewMode as 'standard' | 'mini'}
                            onDelete={handleDelete}
                            onEdit={handleEdit}
                            onRetire={handleRetire}
                        />
                    ))
                ) : (
                    <Paper sx={{ p: 3, textAlign: 'center', gridColumn: '1 / -1' }}>
                        <Typography color="textSecondary">{emptyText}</Typography>
                    </Paper>
                )}
            </Box>
        </Box>
    );

    const renderItems = (items: LabMachine[], emptyText: string) =>
        viewMode === 'table' ? renderTable(items, emptyText) : renderGrid(items, emptyText);

    const groupHeader = (title: string, count: number, group?: MachineGroup) => {
        const index = group ? groups.findIndex(g => g.id === group.id) : -1;
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 2, pb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {title} ({count})
                </Typography>
                {group && (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Move group up">
                            <span>
                                <IconButton size="small" disabled={index <= 0} onClick={() => handleGroupMove(group.id, -1)}>
                                    <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="Move group down">
                            <span>
                                <IconButton size="small" disabled={index < 0 || index >= groups.length - 1} onClick={() => handleGroupMove(group.id, 1)}>
                                    <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="Edit group">
                            <IconButton size="small" onClick={() => { setEditingGroup(group); setGroupDialogOpen(true); }}>
                                <EditIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove group (machines are not affected)">
                            <IconButton size="small" onClick={() => handleGroupDelete(group.id)}>
                                <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    </Box>
                )}
            </Box>
        );
    };

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Machines</Typography>

            <Accordion
                expanded={tableExpanded}
                onChange={() => setTableExpanded(!tableExpanded)}
                TransitionProps={{ timeout: tableExpanded ? undefined : 0 }}
            >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ pr: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            Machines ({loading ? '...' : machines.length})
                        </Typography>
                        {!isMobile && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                                {/* 1. Switches */}
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={groupingEnabled}
                                            onChange={(e) => setGroupingEnabled(e.target.checked)}
                                            size="small"
                                        />
                                    }
                                    label={<Typography variant="body2">Grouping</Typography>}
                                    sx={{ margin: 0 }}
                                />
                                {/* 2. Buttons */}
                                <Button
                                    variant="contained"
                                    color="primary"
                                    onClick={(e) => { e.stopPropagation(); handleAddMachine(); }}
                                    size="small"
                                    startIcon={<AddIcon />}
                                >
                                    Add Machine
                                </Button>
                                {groupingEnabled && (
                                    <Button
                                        variant="outlined"
                                        color="secondary"
                                        onClick={(e) => { e.stopPropagation(); setEditingGroup(null); setGroupDialogOpen(true); }}
                                        size="small"
                                        startIcon={<PlaylistAddIcon />}
                                    >
                                        Add Group
                                    </Button>
                                )}
                                {/* 3. Column picker — table mode only */}
                                {viewMode === 'table' && (
                                    <IconButton size="small" onClick={openColPicker}>
                                        <SettingsIcon fontSize="small" />
                                    </IconButton>
                                )}
                                {/* 4. View mode toggle */}
                                <ToggleButtonGroup
                                    value={viewMode}
                                    exclusive
                                    onChange={handleViewModeChange}
                                    aria-label="view mode"
                                    size="small"
                                >
                                    <ToggleButton value="table" title="Table View">
                                        <TableViewIcon fontSize="small" />
                                    </ToggleButton>
                                    <ToggleButton value="standard" title="Card View">
                                        <DashboardIcon fontSize="small" />
                                    </ToggleButton>
                                    <ToggleButton value="mini" title="Compact View">
                                        <ViewModuleIcon fontSize="small" />
                                    </ToggleButton>
                                </ToggleButtonGroup>
                            </Box>
                        )}
                    </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : groupedMachines ? (
                        <>
                            {groupedMachines.buckets.length === 0 && (
                                <Box sx={{ px: 2, py: 3, textAlign: 'center' }}>
                                    <Typography color="textSecondary">
                                        Grouping is on but no groups are defined yet — use "Add Group" to create one
                                        (e.g. include machines with the Server role).
                                    </Typography>
                                </Box>
                            )}
                            {groupedMachines.buckets.map(({ group, items }) => (
                                <Box key={group.id}>
                                    {groupHeader(group.name, items.length, group)}
                                    {renderItems(items, 'No machines match this group’s roles.')}
                                </Box>
                            ))}
                            {groupedMachines.ungrouped.length > 0 && (
                                <Box>
                                    {groupHeader('Ungrouped', groupedMachines.ungrouped.length)}
                                    {renderItems(groupedMachines.ungrouped, '')}
                                </Box>
                            )}
                        </>
                    ) : (
                        renderItems(sortedMachines, 'No machines yet — add your first machine to start tracking your homelab.')
                    )}
                </AccordionDetails>
            </Accordion>

            {/* Column picker popover — rendered outside accordion */}
            <ColumnPickerPopover
                allColumns={allColumns}
                orderedColumns={orderedColumns}
                hiddenColumns={hiddenColumns}
                anchorEl={colPickerAnchor}
                onClose={closeColPicker}
                onToggle={toggleColumn}
                onMove={moveColumn}
                onReset={resetToDefault}
            />

            <LabMachineAddModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSaved={handleSaved}
                onError={(msg) => showSnackbar(msg, "error")}
                machine={editingMachine}
            />

            <LabMachineGroupDialog
                open={groupDialogOpen}
                onClose={() => setGroupDialogOpen(false)}
                onSave={handleGroupSave}
                group={editingGroup}
                machines={machines}
            />

            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={6000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackMessage(null)}
                    severity={snackbarSeverity}
                    sx={{ width: "100%" }}
                >
                    {snackMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default HomelabMachines;
