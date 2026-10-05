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

// Spaces — the racks, desks and rooms you install things into, and what is in them.
//
// MVP is deliberately a table. The model has to prove itself against real racks before a
// canvas is worth building, and every field here is one a visual view would need anyway.

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import {
    Typography, Box, Button, IconButton, CircularProgress, LinearProgress, Snackbar, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Tooltip, Chip,
    ToggleButton, ToggleButtonGroup,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Collapse, Link,
    ListSubheader,
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { useNavigate } from 'react-router-dom';
import { groupByType, useComponentTypes } from '../../components/Lab_ComponentTypes_Client';
import LabPickerSearch from '../../components/Lab_Picker_Search';
import LabRackElevation from '../../components/Lab_Rack_Elevation';
import { usePageTitle } from '../../hooks/usePageTitle';
import { errorMessage } from '../../utils/errors';

type Space = {
    id: number; name: string; kind: string; componentId?: number | null;
    parentSpaceId?: number | null; heightU?: number | null; widthInches?: number | null;
    depthInches?: number | null; rotation?: number | null; location?: string | null; status: string;
    notes?: string | null; componentLabel?: string | null; sortOrder?: number;
    placementCount: number; usedU?: number | null;
};

type Placement = {
    id: number; spaceId: number; machineId?: number | null; componentId?: number | null;
    positionU?: number | null; heightU?: number | null; face: string; rotation?: number | null; status: string;
    notes?: string | null; occupantLabel?: string | null; occupantKind?: string | null;
    onPlacementId?: number | null;      // sits on this shelf/drawer/tray - no U of its own
};

type Machine = { id: number; name: string };
type Component = { id: number; name?: string; manufacturer?: string; model?: string; nickname?: string; type?: string };

const SPACE_KINDS = ['Rack', 'Desk', 'Shelf', 'Cabinet', 'Room'];
const SPACE_STATUSES = ['active', 'planned', 'retired'];
const FACES = ['front', 'rear', 'both'];
const PLACEMENT_STATUSES = ['planned', 'installed'];

const STORAGE_KEY_SORT_KEY = "lab_spaces_sort_key";
const STORAGE_KEY_SORT_DIR = "lab_spaces_sort_dir";

// [key, label, align, width] - key null means not sortable
const COLUMNS: Array<[string | null, string, 'left' | 'right', string]> = [
    [null, '', 'left', '48px'],
    ['name', 'Name', 'left', 'auto'],
    ['kind', 'Kind', 'left', '90px'],
    ['parentSpaceId', 'Inside', 'left', 'auto'],
    ['componentLabel', 'Component', 'left', 'auto'],
    ['heightU', 'Height', 'right', '80px'],
    ['usedU', 'Used', 'right', '70px'],
    ['freeU', 'Free', 'right', '80px'],
    ['widthInches', 'Width', 'left', '80px'],
    ['location', 'Location', 'left', 'auto'],
    ['status', 'Status', 'left', '100px'],
    [null, 'Actions', 'right', '130px'],
];

const emptySpace: Partial<Space> = { name: '', kind: 'Rack', status: 'active' };
const emptyPlacement: Partial<Placement> = { face: 'front', status: 'planned', heightU: 1 };

const HomelabSpaces = () => {
    usePageTitle('Homelab Spaces');
    const navigate = useNavigate();
    const { typeNames } = useComponentTypes();

    const [spaces, setSpaces] = useState<Space[]>([]);
    const [placements, setPlacements] = useState<Record<number, Placement[]>>({});
    const [expanded, setExpanded] = useState<Record<number, boolean>>({});
    const [machines, setMachines] = useState<Machine[]>([]);
    const [components, setComponents] = useState<Component[]>([]);
    const [loading, setLoading] = useState(true);
    // ⚠️ Refetches must not unmount the list. Swapping the page for a spinner collapses the
    // document to a few pixels, the browser clamps scrollTop to 0, and the reader is thrown
    // back to the top every time they add or remove a placement. Only the first load blanks
    // the page; every refresh after that redraws in place under a hairline progress bar.
    const [refreshing, setRefreshing] = useState(false);
    const [snack, setSnack] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

    const [sortKey, setSortKey] = useState<string>(() =>
        localStorage.getItem(STORAGE_KEY_SORT_KEY) || 'name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() =>
        (localStorage.getItem(STORAGE_KEY_SORT_DIR) as 'asc' | 'desc') || 'asc');
    useEffect(() => { localStorage.setItem(STORAGE_KEY_SORT_KEY, sortKey); }, [sortKey]);
    useEffect(() => { localStorage.setItem(STORAGE_KEY_SORT_DIR, sortDir); }, [sortDir]);

    const handleSort = (key: string) => {
        if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortKey(key); setSortDir('asc'); }
    };

    const [spaceDialog, setSpaceDialog] = useState<Partial<Space> | null>(null);
    const [placementDialog, setPlacementDialog] = useState<Partial<Placement> | null>(null);
    const [pickerQuery, setPickerQuery] = useState('');
    const [faces, setFaces] = useState<Record<number, 'front' | 'rear'>>({});

    const loadPlacements = useCallback(async (spaceId: number) => {
        try {
            const r = await fetch(`/api/lab/spaces/placements?spaceId=${spaceId}`);
            const rows: Placement[] = r.ok ? await r.json() : [];
            setPlacements(prev => ({ ...prev, [spaceId]: rows }));
        } catch {
            setPlacements(prev => ({ ...prev, [spaceId]: [] }));
        }
    }, []);

    const fetchSpaces = useCallback(async () => {
        setRefreshing(true);
        try {
            const r = await fetch('/api/lab/spaces');
            if (!r.ok) throw new Error(await r.text());
            const rows: Space[] = await r.json();
            setSpaces(rows);

            // ⚠️ Expanded by default. A collapsed rack hides its contents, which is the only
            // thing anyone opens this page to look at - the chevron then reads as decoration.
            // Revisit if someone accumulates enough racks for the page to get long.
            setExpanded(prev => {
                const next = { ...prev };
                rows.forEach(s => { if (next[s.id] === undefined) next[s.id] = true; });
                return next;
            });
            rows.forEach(s => loadPlacements(s.id));
        } catch (e) {
            setSnack({ msg: `Could not load spaces: ${errorMessage(e)}`, sev: 'error' });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [loadPlacements]);

    useEffect(() => {
        fetchSpaces();
        fetch('/api/lab/machines').then(r => r.json()).then(setMachines).catch(() => { });
        fetch('/api/lab/components').then(r => r.json()).then(setComponents).catch(() => { });
    }, [fetchSpaces]);


    const toggleExpand = (spaceId: number) => {
        const next = !expanded[spaceId];
        setExpanded(prev => ({ ...prev, [spaceId]: next }));
        if (next && !placements[spaceId]) loadPlacements(spaceId);
    };

    const saveSpace = async () => {
        if (!spaceDialog?.name?.trim()) { setSnack({ msg: 'Name is required.', sev: 'error' }); return; }
        const editing = !!spaceDialog.id;
        try {
            const r = await fetch(editing ? `/api/lab/spaces/${spaceDialog.id}` : '/api/lab/spaces', {
                method: editing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(spaceDialog),
            });
            if (!r.ok) throw new Error(await r.text());
            setSpaceDialog(null);
            setSnack({ msg: editing ? 'Space updated.' : 'Space created.', sev: 'success' });
            fetchSpaces();
        } catch (e) {
            setSnack({ msg: errorMessage(e), sev: 'error' });
        }
    };

    // The API refuses while anything is still placed inside, and says so — surface that
    // verbatim rather than a generic failure, because the reason is the actionable part.
    const deleteSpace = async (id: number) => {
        try {
            const r = await fetch(`/api/lab/spaces/${id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error(await r.text());
            setSnack({ msg: 'Space deleted.', sev: 'success' });
            fetchSpaces();
        } catch (e) {
            setSnack({ msg: errorMessage(e), sev: 'error' });
        }
    };

    const savePlacement = async () => {
        const p = placementDialog;
        if (!p) return;
        if (!p.machineId && !p.componentId) {
            setSnack({ msg: 'Pick a machine or a component.', sev: 'error' }); return;
        }
        const editing = !!p.id;
        try {
            const r = await fetch(editing ? `/api/lab/spaces/placements/${p.id}` : '/api/lab/spaces/placements', {
                method: editing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p),
            });
            if (!r.ok) throw new Error(await r.text());
            setPlacementDialog(null);
            setSnack({ msg: editing ? 'Placement updated.' : 'Placed.', sev: 'success' });
            if (p.spaceId) loadPlacements(p.spaceId);
            fetchSpaces();
        } catch (e) {
            setSnack({ msg: errorMessage(e), sev: 'error' });   // "U12 is taken on the front face by ..."
        }
    };

    const deletePlacement = async (p: Placement) => {
        try {
            const r = await fetch(`/api/lab/spaces/placements/${p.id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error(await r.text());
            loadPlacements(p.spaceId);
            fetchSpaces();
        } catch (e) {
            setSnack({ msg: errorMessage(e), sev: 'error' });
        }
    };

    const sortedSpaces = useMemo(() => {
        const val = (s: Space): string | number => {
            switch (sortKey) {
                case 'freeU': return s.heightU != null ? s.heightU - (s.usedU ?? 0) : -1;
                case 'usedU': return s.usedU ?? -1;
                case 'heightU': return s.heightU ?? -1;
                case 'widthInches': return s.widthInches ?? -1;
                case 'name': return s.name.toLowerCase();
                case 'kind': return s.kind.toLowerCase();
                case 'status': return s.status.toLowerCase();
                case 'parentSpaceId': return (s.parentSpaceId ?? '').toString();
                case 'componentLabel': return (s.componentLabel ?? '').toLowerCase();
                case 'location': return (s.location ?? '').toLowerCase();
                default: return '';
            }
        };
        return [...spaces].sort((a, b) => {
            const x = val(a), y = val(b);
            const c = typeof x === 'number' && typeof y === 'number'
                ? x - y
                : String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
            return sortDir === 'asc' ? c : -c;
        });
    }, [spaces, sortKey, sortDir]);

    // ⛔ NICKNAME IS A NAME, and leaving it out of this made a part unfindable. A patch panel
    // was entered with a nickname and no manufacturer or model - entirely legitimate for a
    // no-brand part - and every label in the app is built from manufacturer + model, so it
    // showed in the picker as "component 215", matched nothing when its own name was typed,
    // and would have drawn as a blank block had it ever been placed.
    const componentLabel = (c: Component) =>
        c.name || [c.manufacturer, c.model].filter(Boolean).join(' ')
        || c.nickname || `component ${c.id}`;

    // Sorted for PICKING, which is not how the API sorts them. /api/lab/components returns
    // Type then Model so the Inventory table groups by type - useless in a dropdown, where
    // you are hunting one known name. Sort on the label actually rendered, or the order looks
    // arbitrary: the label is manufacturer + model while the API sorts on model alone.
    const sortedComponents = useMemo(
        () => [...components].sort((a, b) =>
            componentLabel(a).localeCompare(componentLabel(b), undefined, { sensitivity: 'base' })),
        [components]);

    const sortedMachines = useMemo(
        () => [...machines].sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })),
        [machines]);

    // Filtered for the placement picker. 200+ components is not a scrollable list, and the
    // one you want is usually known by name - so match on the rendered label, and on type so
    // "rack" or "psu" narrows it the way people actually think about parts.
    const q = pickerQuery.trim().toLowerCase();
    const pickerComponents = useMemo(
        () => q
            ? sortedComponents.filter(c =>
                `${componentLabel(c)} ${c.nickname ?? ''} ${c.type ?? ''}`.toLowerCase().includes(q))
            : sortedComponents,
        [sortedComponents, q]);
    const pickerMachines = useMemo(
        () => q ? sortedMachines.filter(m => (m.name || '').toLowerCase().includes(q)) : sortedMachines,
        [sortedMachines, q]);

    // Grouped in the vocabulary's own order, so pickers and the Inventory sections agree on
    // where a part lives - including types added since, which is the point of managed types.
    const groupedComponents = useMemo(
        () => groupByType(pickerComponents, typeNames), [pickerComponents, typeNames]);

    // One search box, rendered by both dialogs. Two copies would drift, and the space picker
    // needs exactly what the placement picker needs - the list it filters is the same 200 rows.
    const pickerSearch = (placeholder: string, matchCount: number) => (
        <LabPickerSearch value={pickerQuery} onChange={setPickerQuery}
            placeholder={placeholder} matchCount={matchCount}
            sx={{ gridColumn: '1 / -1' }} />
    );

    // Grouped MenuItems for a component picker, shared by both dialogs.
    const componentMenuItems = () => groupedComponents.flatMap(([type, items]) => [
        <ListSubheader key={`h-${type}`}>{type}</ListSubheader>,
        ...items.map(c => (
            <MenuItem key={c.id} value={c.id}>{componentLabel(c)}</MenuItem>
        )),
    ]);

    if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

    return (
        <Box sx={{ padding: 2 }}>
            <Box sx={{ height: 2, mb: 1 }}>{refreshing && <LinearProgress sx={{ height: 2 }} />}</Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6">Spaces</Typography>
                    {spaces.length > 0 && <Chip size="small" label={`${spaces.length}`} />}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button variant="contained" size="small" startIcon={<AddIcon />}
                        onClick={() => setSpaceDialog({ ...emptySpace })}>
                        Add Space
                    </Button>
                </Box>
            </Box>

            <TableContainer>
                <Table size="small">
                    <colgroup>
                        {COLUMNS.map(([, , , w], i) => <col key={i} style={{ width: w }} />)}
                    </colgroup>
                    <TableHead>
                        <TableRow sx={{ bgcolor: 'action.hover' }}>
                            {COLUMNS.map(([key, label, align], i) => (
                                <TableCell key={i} align={align} sx={{ fontWeight: 600 }}
                                    sortDirection={key && sortKey === key ? sortDir : false}>
                                    {key ? (
                                        <TableSortLabel active={sortKey === key}
                                            direction={sortKey === key ? sortDir : 'asc'}
                                            onClick={() => handleSort(key)}>
                                            {label}
                                        </TableSortLabel>
                                    ) : label}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {spaces.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                                    <Typography color="text.secondary">
                                        No spaces yet. Add the rack you just bought.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                        {sortedSpaces.map(s => {
                            const free = s.heightU != null ? s.heightU - (s.usedU ?? 0) : null;
                            const rows = placements[s.id] ?? [];
                            return (
                                <Fragment key={s.id}>
                                    <TableRow hover>
                                        <TableCell>
                                            <IconButton size="small" onClick={() => toggleExpand(s.id)}>
                                                {expanded[s.id] ? <KeyboardArrowDownIcon /> : <KeyboardArrowRightIcon />}
                                            </IconButton>
                                        </TableCell>
                                        <TableCell><Typography fontWeight="medium">{s.name}</Typography></TableCell>
                                        <TableCell>{s.kind}</TableCell>
                                        <TableCell>{s.parentSpaceId ? (spaces.find(p => p.id === s.parentSpaceId)?.name ?? `#${s.parentSpaceId}`) : '—'}</TableCell>
                                        <TableCell>
                                            {s.componentLabel
                                                ? (
                                                    <Tooltip title="Open this component's record">
                                                        <Link component="button" variant="body2" underline="hover"
                                                            sx={{ textAlign: 'left' }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/homelab/component/${s.componentId}`);
                                                            }}>
                                                            {s.componentLabel}
                                                        </Link>
                                                    </Tooltip>
                                                )
                                                : <Typography variant="body2" color="text.secondary">—</Typography>}
                                        </TableCell>
                                        <TableCell align="right">{s.heightU != null ? `${s.heightU}U` : '—'}</TableCell>
                                        <TableCell align="right">{s.usedU ? `${s.usedU}U` : '—'}</TableCell>
                                        <TableCell align="right">
                                            {free != null
                                                ? <Chip size="small" label={`${free}U`} color={free <= 0 ? 'error' : free <= 2 ? 'warning' : 'default'} />
                                                : '—'}
                                        </TableCell>
                                        <TableCell>{s.widthInches ? `${s.widthInches}"` : '—'}</TableCell>
                                        <TableCell>{s.location || '—'}</TableCell>
                                        <TableCell><Chip size="small" label={s.status} /></TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="Place something here">
                                                <IconButton size="small"
                                                    onClick={() => setPlacementDialog({ ...emptyPlacement, spaceId: s.id })}>
                                                    <AddIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <IconButton size="small" onClick={() => setSpaceDialog(s)}><EditIcon fontSize="small" /></IconButton>
                                            <IconButton size="small" onClick={() => deleteSpace(s.id)}><DeleteIcon fontSize="small" /></IconButton>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell colSpan={12} sx={{ py: 0, borderBottom: expanded[s.id] ? undefined : 'none' }}>
                                            <Collapse in={!!expanded[s.id]} unmountOnExit>
                                                <Box sx={{ py: 2, pl: 6, display: 'flex', gap: 3, alignItems: 'flex-start' }}>
                                                    {/* 🔑 The drawing sits LEFT of the list, and shows
                                                        what a list structurally cannot: the empty U
                                                        between things. */}
                                                    <Box>
                                                        <ToggleButtonGroup size="small" exclusive
                                                            value={faces[s.id] ?? 'front'}
                                                            onChange={(_e, v) => v && setFaces(f => ({ ...f, [s.id]: v }))}
                                                            sx={{ mb: 1 }}>
                                                            <ToggleButton value="front">Front</ToggleButton>
                                                            <ToggleButton value="rear">Rear</ToggleButton>
                                                        </ToggleButtonGroup>
                                                        <LabRackElevation
                                                            kind={s.kind}
                                                            name={s.name}
                                                            heightU={s.heightU}
                                                            widthInches={s.widthInches}
                                                            rotation={s.rotation ?? 0}
                                                            placements={rows}
                                                            face={faces[s.id] ?? 'front'}
                                                            onSelect={(id) => {
                                                                const p = rows.find(x => x.id === id);
                                                                if (p) setPlacementDialog(p);
                                                            }}
                                                        />
                                                    </Box>
                                                    <Box sx={{ flexGrow: 1 }}>
                                                    {rows.length === 0
                                                        ? <Typography variant="body2" color="text.secondary">Nothing placed here yet.</Typography>
                                                        : (
                                                            <Table size="small">
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>Occupies</TableCell>
                                                                        <TableCell>Height</TableCell>
                                                                        <TableCell>Component</TableCell>
                                                                        <TableCell>Kind</TableCell>
                                                                        <TableCell>Face</TableCell>
                                                                        <TableCell>Status</TableCell>
                                                                        <TableCell align="right">Actions</TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {rows.map(p => (
                                                                        <TableRow key={p.id}>
                                                                            <TableCell>
                                                                                {p.onPlacementId != null
                                                                                    ? `on ${rows.find(x => x.id === p.onPlacementId)?.occupantLabel ?? 'a shelf'}`
                                                                                    : p.positionU == null
                                                                                    ? <Typography variant="body2" color="warning.main">not placed</Typography>
                                                                                    : (p.heightU ?? 1) > 1
                                                                                        ? `U${p.positionU}–U${p.positionU + (p.heightU ?? 1) - 1}`
                                                                                        : `U${p.positionU}`}
                                                                            </TableCell>
                                                                            <TableCell>{p.heightU ? `${p.heightU}U` : '—'}</TableCell>
                                                                            <TableCell>
                                                                                {p.occupantLabel
                                                                                    ? (
                                                                                        <Link component="button" variant="body2" underline="hover"
                                                                                            sx={{ textAlign: 'left' }}
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                navigate(p.machineId
                                                                                                    ? `/homelab/configure-machine/${p.machineId}`
                                                                                                    : `/homelab/component/${p.componentId}`);
                                                                                            }}>
                                                                                            {p.occupantLabel}
                                                                                        </Link>
                                                                                    )
                                                                                    : '—'}
                                                                            </TableCell>
                                                                            <TableCell>{p.occupantKind}</TableCell>
                                                                            <TableCell>{p.face}</TableCell>
                                                                            <TableCell>
                                                                                <Chip size="small" label={p.status}
                                                                                    color={p.status === 'installed' ? 'success' : 'default'} />
                                                                            </TableCell>
                                                                            <TableCell align="right">
                                                                                <IconButton size="small" onClick={() => setPlacementDialog(p)}>
                                                                                    <EditIcon fontSize="small" />
                                                                                </IconButton>
                                                                                <IconButton size="small" onClick={() => deletePlacement(p)}>
                                                                                    <DeleteIcon fontSize="small" />
                                                                                </IconButton>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        )}
                                                    </Box>
                                                </Box>
                                            </Collapse>
                                        </TableCell>
                                    </TableRow>
                                </Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* ------------------------------------------------------------ space dialog */}
            <Dialog open={!!spaceDialog} onClose={() => { setSpaceDialog(null); setPickerQuery(''); }} maxWidth="sm" fullWidth>
                <DialogTitle>{spaceDialog?.id ? 'Edit Space' : 'Add Space'}</DialogTitle>
                <DialogContent sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr', pt: 2 }}>
                    <TextField label="Name" value={spaceDialog?.name ?? ''} sx={{ gridColumn: '1 / -1' }}
                        onChange={e => setSpaceDialog(d => ({ ...d, name: e.target.value }))} />
                    <TextField select label="Kind" value={spaceDialog?.kind ?? 'Rack'}
                        onChange={e => setSpaceDialog(d => ({ ...d, kind: e.target.value }))}>
                        {SPACE_KINDS.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                    </TextField>
                    {/* The space this one sits inside - a rack or desk in a room. The Rooms tab and the
                        network page group by it. A space cannot sit inside itself or one of its own children. */}
                    <TextField select label="Inside (room)" value={spaceDialog?.parentSpaceId ?? ''} sx={{ gridColumn: '1 / -1' }}
                        helperText="The room (or other space) this sits in. The Rooms tab and the network page group by it."
                        onChange={e => setSpaceDialog(d => ({ ...d, parentSpaceId: e.target.value === '' ? null : Number(e.target.value) }))}>
                        <MenuItem value="">Top level - not inside another space</MenuItem>
                        {spaces.filter(o => {
                            if (o.id === spaceDialog?.id) return false;
                            // hide this space's own children (and theirs): picking one would make a loop
                            for (let at: Space | undefined = o, n = 0; at && n < 20; at = spaces.find(x => x.id === at!.parentSpaceId), n++)
                                if (at.parentSpaceId === spaceDialog?.id && spaceDialog?.id) return false;
                            return true;
                        }).sort((a, b) => (a.kind === 'Room' ? 0 : 1) - (b.kind === 'Room' ? 0 : 1) || a.name.localeCompare(b.name))
                            .map(o => <MenuItem key={o.id} value={o.id}>{o.name}{o.kind === 'Room' ? '' : ` (${o.kind})`}</MenuItem>)}
                    </TextField>
                    <TextField label="Order (lowest first)" type="number" value={spaceDialog?.sortOrder ?? ''}
                        helperText="Rooms tab and network page, left to right"
                        onChange={e => setSpaceDialog(d => ({ ...d, sortOrder: e.target.value === '' ? undefined : Number(e.target.value) }))} />
                    <TextField select label="Status" value={spaceDialog?.status ?? 'active'}
                        onChange={e => setSpaceDialog(d => ({ ...d, status: e.target.value }))}>
                        {SPACE_STATUSES.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                    </TextField>
                    {pickerSearch('Search components...', pickerComponents.length)}
                    <TextField select label="Is this a component you own?" sx={{ gridColumn: '1 / -1' }}
                        value={spaceDialog?.componentId ?? ''}
                        helperText="Links the rack to its purchase, so price and invoice live in one place"
                        onChange={e => setSpaceDialog(d => ({ ...d, componentId: e.target.value ? Number(e.target.value) : null }))}>
                        <MenuItem value="">— none —</MenuItem>
                        {componentMenuItems()}
                    </TextField>
                    <TextField label="Height (U)" type="number" value={spaceDialog?.heightU ?? ''}
                        onChange={e => setSpaceDialog(d => ({ ...d, heightU: e.target.value ? Number(e.target.value) : null }))} />
                    <TextField label="Width (inches)" type="number" value={spaceDialog?.widthInches ?? ''}
                        helperText="e.g. 7, 10, 19"
                        onChange={e => setSpaceDialog(d => ({ ...d, widthInches: e.target.value ? Number(e.target.value) : null }))} />
                    <TextField select label="Rotation" value={spaceDialog?.rotation ?? 0}
                        helperText="How the RACK is mounted — visual only"
                        onChange={e => setSpaceDialog(d => ({ ...d, rotation: Number(e.target.value) }))}>
                        {[0, 90, 180, 270].map(r => <MenuItem key={r} value={r}>{r}°</MenuItem>)}
                    </TextField>
                    <TextField label="Location" value={spaceDialog?.location ?? ''} sx={{ gridColumn: '1 / -1' }}
                        onChange={e => setSpaceDialog(d => ({ ...d, location: e.target.value }))} />
                    <TextField label="Notes" value={spaceDialog?.notes ?? ''} multiline rows={2} sx={{ gridColumn: '1 / -1' }}
                        onChange={e => setSpaceDialog(d => ({ ...d, notes: e.target.value }))} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setSpaceDialog(null); setPickerQuery(''); }}>Cancel</Button>
                    <Button variant="contained" onClick={saveSpace}>Save</Button>
                </DialogActions>
            </Dialog>

            {/* -------------------------------------------------------- placement dialog */}
            <Dialog open={!!placementDialog} onClose={() => { setPlacementDialog(null); setPickerQuery(''); }} maxWidth="sm" fullWidth>
                <DialogTitle>{placementDialog?.id ? 'Edit Placement' : 'Place Something'}</DialogTitle>
                <DialogContent sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr', pt: 2 }}>
                    {pickerSearch('Search machines and components...',
                                  pickerMachines.length + pickerComponents.length)}
                    <TextField select label="Machine" value={placementDialog?.machineId ?? ''} sx={{ gridColumn: '1 / -1' }}
                        helperText="A placement holds a machine OR a component, not both"
                        onChange={e => setPlacementDialog(d => ({
                            ...d, machineId: e.target.value ? Number(e.target.value) : null, componentId: null,
                        }))}>
                        <MenuItem value="">— none —</MenuItem>
                        {pickerMachines.map(m => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                    </TextField>
                    <TextField select label="Component" value={placementDialog?.componentId ?? ''} sx={{ gridColumn: '1 / -1' }}
                        onChange={e => setPlacementDialog(d => ({
                            ...d, componentId: e.target.value ? Number(e.target.value) : null, machineId: null,
                        }))}>
                        <MenuItem value="">— none —</MenuItem>
                        {componentMenuItems()}
                    </TextField>
                    {/* Several things share a U by sitting ON a shelf, drawer or tray placed in this space:
                        then it has no U of its own and is drawn inside the shelf, side by side. */}
                    <TextField select label="Sits on" value={placementDialog?.onPlacementId ?? ''} sx={{ gridColumn: '1 / -1' }}
                        helperText="A shelf, drawer or tray in this space - things on it share its U, side by side"
                        onChange={e => setPlacementDialog(d => ({ ...d, onPlacementId: e.target.value ? Number(e.target.value) : null }))}>
                        <MenuItem value="">— its own U —</MenuItem>
                        {(placements[placementDialog?.spaceId ?? -1] ?? [])
                            .filter(x => x.onPlacementId == null && x.id !== placementDialog?.id && x.positionU != null)
                            .map(x => <MenuItem key={x.id} value={x.id}>{x.occupantLabel ?? `placement ${x.id}`} (U{x.positionU})</MenuItem>)}
                    </TextField>
                    {placementDialog?.onPlacementId == null && (<>
                    <TextField label="Bottom U" type="number" value={placementDialog?.positionU ?? ''}
                        helperText="U1 is the bottom of the rack"
                        onChange={e => setPlacementDialog(d => ({ ...d, positionU: e.target.value ? Number(e.target.value) : null }))} />
                    <TextField label="Height (U)" type="number" value={placementDialog?.heightU ?? ''}
                        helperText="How many U it occupies"
                        onChange={e => setPlacementDialog(d => ({ ...d, heightU: e.target.value ? Number(e.target.value) : null }))} />
                    </>)}
                    {placementDialog?.onPlacementId != null && (
                        <TextField label="Height on the shelf (U)" type="number" value={placementDialog?.heightU ?? 1}
                            helperText="How tall it stands on the shelf - drawn only, never counted as used U"
                            onChange={e => setPlacementDialog(d => ({ ...d, heightU: e.target.value ? Number(e.target.value) : 1 }))} />
                    )}

                    {/* 🔑 A position on its own says nothing - what you are actually choosing is a
                        RANGE, and it is the height that decides how far it reaches. Showing the
                        span as you type is the difference between "U5, height 4" (two numbers to
                        hold in your head) and "occupies U5-U8 of 12" (the thing you meant). */}
                    <Box sx={{ gridColumn: '1 / -1', mt: -1 }}>
                        {(() => {
                            const space = spaces.find(s => s.id === placementDialog?.spaceId);
                            const start = placementDialog?.positionU;
                            const h = placementDialog?.heightU ?? 1;
                            if (placementDialog?.onPlacementId != null) {
                                return (
                                    <Typography variant="caption" color="text.secondary">
                                        Shares that shelf&apos;s U and face, side by side with anything else on it.
                                    </Typography>
                                );
                            }
                            if (!start) {
                                return (
                                    <Typography variant="caption" color="text.secondary">
                                        No bottom U set — it will sit in this space unpositioned, and
                                        show in the rack's unplaced tray rather than on the drawing.
                                    </Typography>
                                );
                            }
                            const top = start + h - 1;
                            const overflows = space?.heightU != null && top > space.heightU;
                            return (
                                <Typography variant="caption" color={overflows ? 'error' : 'text.secondary'}>
                                    {overflows
                                        ? `Does not fit: U${start}–U${top} runs past the top of a ${space!.heightU}U rack.`
                                        : `Occupies ${h === 1 ? `U${start}` : `U${start}–U${top}`}${
                                            space?.heightU ? ` of ${space.heightU}` : ''}.`}
                                </Typography>
                            );
                        })()}
                    </Box>
                    <TextField select label="Face" value={placementDialog?.face ?? 'front'}
                        onChange={e => setPlacementDialog(d => ({ ...d, face: e.target.value }))}>
                        {FACES.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                    </TextField>
                    {/* ⚠️ The SECOND rotation. The rack itself can be mounted turned (set on the
                        space); this is how THIS unit is mounted inside it. They are independent -
                        a turned tray in an upright rack, or an upright unit in a rack on its
                        side - and neither changes U numbering, occupancy or fit. */}
                    <TextField select label="Unit rotation" value={placementDialog?.rotation ?? 0}
                        helperText="How this unit is mounted — visual only"
                        onChange={e => setPlacementDialog(d => ({ ...d, rotation: Number(e.target.value) }))}>
                        {[0, 90, 180, 270].map(r => <MenuItem key={r} value={r}>{r}°</MenuItem>)}
                    </TextField>
                    <TextField select label="Status" value={placementDialog?.status ?? 'planned'}
                        helperText="Planned until it is physically in"
                        onChange={e => setPlacementDialog(d => ({ ...d, status: e.target.value }))}>
                        {PLACEMENT_STATUSES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </TextField>
                    <TextField label="Notes" value={placementDialog?.notes ?? ''} multiline rows={2} sx={{ gridColumn: '1 / -1' }}
                        onChange={e => setPlacementDialog(d => ({ ...d, notes: e.target.value }))} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setPlacementDialog(null); setPickerQuery(''); }}>Cancel</Button>
                    <Button variant="contained" onClick={savePlacement}>Save</Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={!!snack} autoHideDuration={6000} onClose={() => setSnack(null)}>
                <Alert severity={snack?.sev ?? 'success'} onClose={() => setSnack(null)}>{snack?.msg}</Alert>
            </Snackbar>
        </Box>
    );
};

export default HomelabSpaces;
