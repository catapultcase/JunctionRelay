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

// Manage the component vocabulary: add, rename, reorder, retire, and define the typed spec
// fields each category carries.

import { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, IconButton,
    Table, TableBody, TableCell, TableHead, TableRow, TableContainer, TextField, MenuItem,
    Chip, Tooltip, Alert, Divider, FormControlLabel, Checkbox,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import SortByAlphaIcon from '@mui/icons-material/SortByAlpha';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import {
    type ComponentType, type ComponentTypeField, type TypeFieldKind, parseFields, useComponentTypes,
} from './Lab_ComponentTypes_Client';
import { errorMessage } from '../utils/errors';

const KINDS: TypeFieldKind[] = ['text', 'number', 'select', 'boolean'];

interface Props {
    open: boolean;
    onClose: () => void;
    onChanged?: () => void;
}

const emptyField = (order: number): ComponentTypeField => ({
    key: '', label: '', kind: 'text', sortOrder: order,
});

const Lab_ComponentTypes_Dialog = ({ open, onClose, onChanged }: Props) => {
    const { types, reload } = useComponentTypes();
    const [editing, setEditing] = useState<ComponentType | null>(null);
    const [fields, setFields] = useState<ComponentTypeField[]>([]);
    const [originalName, setOriginalName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [confirmAlpha, setConfirmAlpha] = useState(false);

    useEffect(() => { if (open) reload(); }, [open, reload]);

    const startEdit = (t: ComponentType) => {
        setEditing({ ...t });
        setOriginalName(t.name);
        setFields(parseFields(t));
        setError(null);
        setInfo(null);
    };

    const startAdd = () => {
        setEditing({
            id: 0, name: '', label: '', sortOrder: 0, status: 'active', componentCount: 0,
        });
        setOriginalName('');
        setFields([]);
        setError(null);
        setInfo(null);
    };

    const save = async () => {
        if (!editing) return;
        if (!editing.name.trim()) { setError('Name is required.'); return; }
        setError(null);

        const body = {
            ...editing,
            fieldsJson: JSON.stringify(fields.map((f, i) => ({ ...f, sortOrder: i }))),
        };

        try {
            let res: Response;
            if (editing.id === 0) {
                res = await fetch('/api/lab/component-types', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            } else {
                // Rename first so the components move with it, then save the rest. Doing it in
                // one PUT would rename the vocabulary entry and leave its components behind.
                if (editing.name.trim() !== originalName) {
                    const r = await fetch(`/api/lab/component-types/${editing.id}/rename`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ newName: editing.name.trim() }),
                    });
                    if (!r.ok) throw new Error(await r.text());
                    const moved = (await r.json()).componentsRepointed ?? 0;
                    setInfo(`Renamed. ${moved} component${moved === 1 ? '' : 's'} moved to '${editing.name.trim()}'.`);
                }
                res = await fetch(`/api/lab/component-types/${editing.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            }
            if (!res.ok) throw new Error(await res.text());
            await reload();
            onChanged?.();
            setEditing(null);
        } catch (e) {
            setError(errorMessage(e));
        }
    };

    const remove = async (t: ComponentType) => {
        try {
            const r = await fetch(`/api/lab/component-types/${t.id}`, { method: 'DELETE' });
            if (!r.ok) throw new Error(await r.text());   // "blocked: N components are filed as..."
            await reload();
            onChanged?.();
        } catch (e) {
            setError(errorMessage(e));
        }
    };

    const move = async (index: number, delta: number) => {
        const ordered = [...types];
        const target = index + delta;
        if (target < 0 || target >= ordered.length) return;
        [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
        await fetch('/api/lab/component-types/reorder', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ordered.map(t => t.id)),
        });
        await reload();
        onChanged?.();
    };

    // ⚠️ DESTRUCTIVE, and asks first. The order shipped is roughly how you build a machine -
    // CPU, GPU, MOBO, RAM, Storage - with later additions appended, and the arrows above let it
    // be arranged deliberately. Sorting A-Z overwrites every one of those positions and there is
    // no undo: the previous order is not stored anywhere once SortOrder is rewritten.
    const alphabetise = async () => {
        const ordered = [...types].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        await fetch('/api/lab/component-types/reorder', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ordered.map(t => t.id)),
        });
        setConfirmAlpha(false);
        setInfo(`Sorted ${ordered.length} types A-Z.`);
        await reload();
        onChanged?.();
    };

    const setField = (i: number, patch: Partial<ComponentTypeField>) =>
        setFields(fs => fs.map((f, n) => (n === i ? { ...f, ...patch } : f)));

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    Manage Component Types
                    {!confirmAlpha ? (
                        <Button size="small" variant="outlined" startIcon={<SortByAlphaIcon />}
                            onClick={() => setConfirmAlpha(true)}>
                            Sort A–Z
                        </Button>
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" color="warning.main">
                                Replaces your custom order — no undo.
                            </Typography>
                            <Button size="small" onClick={() => setConfirmAlpha(false)}>Cancel</Button>
                            <Button size="small" variant="contained" color="warning"
                                onClick={alphabetise}>
                                Sort A–Z
                            </Button>
                        </Box>
                    )}
                </Box>
            </DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
                {info && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setInfo(null)}>{info}</Alert>}

                {!editing && (
                    <>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={startAdd}>
                                Add Type
                            </Button>
                        </Box>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'action.hover' }}>
                                        <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Section Title</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }} align="right">Components</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }} align="right">Spec Fields</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }} align="right">Order</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {types.map((t, i) => (
                                        <TableRow key={t.id} hover>
                                            <TableCell><Typography fontWeight="medium">{t.name}</Typography></TableCell>
                                            <TableCell>{t.label || '—'}</TableCell>
                                            <TableCell align="right">{t.componentCount}</TableCell>
                                            <TableCell align="right">{parseFields(t).length}</TableCell>
                                            <TableCell>
                                                <Chip size="small" label={t.status}
                                                    color={t.status === 'retired' ? 'default' : 'success'} />
                                            </TableCell>
                                            <TableCell align="right">
                                                <IconButton size="small" disabled={i === 0} onClick={() => move(i, -1)}>
                                                    <ArrowUpwardIcon fontSize="small" />
                                                </IconButton>
                                                <IconButton size="small" disabled={i === types.length - 1} onClick={() => move(i, 1)}>
                                                    <ArrowDownwardIcon fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                            <TableCell align="right">
                                                <IconButton size="small" onClick={() => startEdit(t)}>
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                <Tooltip title={t.componentCount > 0
                                                    ? 'Components are filed under this type — retire it instead'
                                                    : 'Delete'}>
                                                    <span>
                                                        <IconButton size="small" disabled={t.componentCount > 0}
                                                            onClick={() => remove(t)}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </>
                )}

                {editing && (
                    <Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mb: 3 }}>
                            <TextField label="Name" size="small" value={editing.name}
                                helperText="Stored on each component, e.g. UPS"
                                onChange={e => setEditing(t => t && { ...t, name: e.target.value })} />
                            <TextField label="Section Title" size="small" value={editing.label ?? ''}
                                helperText="Plural heading, e.g. UPSes"
                                onChange={e => setEditing(t => t && { ...t, label: e.target.value })} />
                            <TextField select label="Status" size="small" value={editing.status}
                                helperText="Retired hides it from pickers"
                                onChange={e => setEditing(t => t && { ...t, status: e.target.value })}>
                                <MenuItem value="active">active</MenuItem>
                                <MenuItem value="retired">retired</MenuItem>
                            </TextField>
                        </Box>

                        {editing.id !== 0 && editing.name.trim() !== originalName && editing.componentCount > 0 && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                Renaming moves {editing.componentCount} component
                                {editing.componentCount === 1 ? '' : 's'} from '{originalName}' to
                                '{editing.name.trim()}'.
                            </Alert>
                        )}

                        <Divider sx={{ mb: 2 }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="subtitle2">Spec Fields</Typography>
                            <Button size="small" startIcon={<AddIcon />}
                                onClick={() => setFields(fs => [...fs, emptyField(fs.length)])}>
                                Add Field
                            </Button>
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                            One definition drives both the add/edit form and this type's Inventory columns.
                            Tick "In table" to make a field a column.
                        </Typography>

                        {fields.length === 0 && (
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                No typed fields — components of this type use the free-text Spec box.
                            </Typography>
                        )}

                        {fields.map((f, i) => (
                            <Box key={i} sx={{
                                display: 'grid', gap: 1, mb: 1, alignItems: 'center',
                                gridTemplateColumns: '1fr 1fr 1fr 0.8fr 0.8fr auto auto auto',
                            }}>
                                <TextField label="Key" size="small" value={f.key}
                                    onChange={e => setField(i, { key: e.target.value })} />
                                <TextField label="Form label" size="small" value={f.label}
                                    onChange={e => setField(i, { label: e.target.value })} />
                                <TextField label="Table label" size="small" value={f.tableLabel ?? ''}
                                    placeholder={f.label}
                                    onChange={e => setField(i, { tableLabel: e.target.value || undefined })} />
                                <TextField select label="Kind" size="small" value={f.kind}
                                    onChange={e => {
                                        const kind = KINDS.find(k => k === e.target.value);
                                        if (kind) setField(i, { kind });
                                    }}>
                                    {KINDS.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                                </TextField>
                                <TextField label="Unit" size="small" value={f.unit ?? ''}
                                    onChange={e => setField(i, { unit: e.target.value || undefined })} />
                                <FormControlLabel label="In table" control={
                                    <Checkbox size="small" checked={!!f.showInTable}
                                        onChange={e => setField(i, { showInTable: e.target.checked })} />
                                } />
                                <FormControlLabel label="Right" control={
                                    <Checkbox size="small" checked={f.align === 'right'}
                                        onChange={e => setField(i, { align: e.target.checked ? 'right' : undefined })} />
                                } />
                                <IconButton size="small" onClick={() => setFields(fs => fs.filter((_, n) => n !== i))}>
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                                {f.kind === 'select' && (
                                    <TextField label="Options (comma separated)" size="small"
                                        sx={{ gridColumn: '1 / -1' }}
                                        value={(f.options ?? []).join(', ')}
                                        onChange={e => setField(i, {
                                            options: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                                        })} />
                                )}
                            </Box>
                        ))}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                {editing
                    ? (
                        <>
                            <Button onClick={() => setEditing(null)}>Back</Button>
                            <Button variant="contained" onClick={save}>Save</Button>
                        </>
                    )
                    : <Button onClick={onClose}>Close</Button>}
            </DialogActions>
        </Dialog>
    );
};

export default Lab_ComponentTypes_Dialog;
