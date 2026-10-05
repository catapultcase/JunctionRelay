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

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    ListSubheader,
    Box,
    Typography,
    CircularProgress,
    Chip,
    Button,
    IconButton,
    TextField,
    MenuItem,
    FormControlLabel,
    Switch,
    Tooltip,
    Snackbar,
    Alert,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from "@mui/material";
import { useParams, useNavigate } from "react-router-dom";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { groupByType, useComponentTypes } from '../../components/Lab_ComponentTypes_Client';
import LabPickerSearch from '../../components/Lab_Picker_Search';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoIcon from '@mui/icons-material/Info';
import MemoryIcon from '@mui/icons-material/Memory';
import HistoryIcon from '@mui/icons-material/History';
import UndoIcon from '@mui/icons-material/Undo';
import AddIcon from '@mui/icons-material/Add';
import EjectIcon from '@mui/icons-material/Eject';
import { CONFIGURE_PAGE_HEADER_SX, getFieldGridSx, CONFIGURE_FIELD_FULL_WIDTH_SX } from '@junctionrelay/styles';
import { usePageTitle } from '../../hooks/usePageTitle';
import { useAutoSave } from '../../hooks/useAutoSave';
import { type LabMachine, getMachineStatusInfo, MACHINE_STATUS_OPTIONS, MACHINE_KINDS, machineEmoji } from '../../components/Lab_Machines_Helpers';
import { errorMessage } from '../../utils/errors';

interface LabComponent {
    id: number;
    type: string;
    name?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    nickname?: string | null;
    spec?: string | null;
    status: string;
    currentMachineId?: number | null;
}

interface LabMovement {
    id: number;
    componentId: number;
    componentLabel?: string | null;
    fromMachineName?: string | null;
    toMachineName?: string | null;
    slotLabel?: string | null;
    movedAt: string;
    reason?: string | null;
}

const componentLabel = (c: LabComponent) => {
    const base = c.name || [c.manufacturer, c.model].filter(Boolean).join(' ') || c.nickname || c.type;
    return c.nickname ? `${base} ("${c.nickname}")` : base;
};

const ConfigureMachine = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [machine, setMachine] = useState<(LabMachine & { installedComponents?: LabComponent[] }) | null>(null);
    // Baseline for autosave change detection — updated only on load and successful save,
    // never on edit (passing live state here silently disables saves).
    const [originalMachine, setOriginalMachine] = useState<LabMachine | null>(null);
    const [loading, setLoading] = useState(true);
    const [movements, setMovements] = useState<LabMovement[]>([]);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    // Accordions default expanded (no persisted state needed on a detail page)
    const [detailsExpanded, setDetailsExpanded] = useState(true);
    const [componentsExpanded, setComponentsExpanded] = useState(true);
    const [timelineExpanded, setTimelineExpanded] = useState(true);

    // Install-from-shelf dialog
    const [installDialogOpen, setInstallDialogOpen] = useState(false);
    const [installQuery, setInstallQuery] = useState('');
    const [shelfComponents, setShelfComponents] = useState<LabComponent[]>([]);
    const [installComponentId, setInstallComponentId] = useState<number | ''>('');
    const [installSlot, setInstallSlot] = useState('');
    const [installDate, setInstallDate] = useState('');

    const { typeNames } = useComponentTypes();

    // Filter on the rendered label AND the type, so "psu" or "rack" narrows the shelf the way
    // people think about parts rather than only by model string.
    const shelfFiltered = useMemo(() => {
        const q = installQuery.trim().toLowerCase();
        const sorted = [...shelfComponents].sort((a, b) =>
            componentLabel(a).localeCompare(componentLabel(b), undefined, { sensitivity: 'base' }));
        return q
            ? sorted.filter(c => `${componentLabel(c)} ${c.type ?? ''}`.toLowerCase().includes(q))
            : sorted;
    }, [shelfComponents, installQuery]);

    const shelfGrouped = useMemo(
        () => groupByType(shelfFiltered, typeNames), [shelfFiltered, typeNames]);

    // Timeline as-of view
    const [timelineDate, setTimelineDate] = useState('');
    const [timelineLoadout, setTimelineLoadout] = useState<LabComponent[] | null>(null);
    const [timelineAsOf, setTimelineAsOf] = useState<string | null>(null);

    usePageTitle(machine ? `Machine - ${machine.name}` : 'Machine');

    const showSnackbar = useCallback((message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    }, []);

    const autoSave = useAutoSave(`/api/lab/machines/${id}`, originalMachine, {
        onSuccess: (saved) => setOriginalMachine(saved),
        onError: () => showSnackbar('Failed to save machine', 'error'),
    });

    const fetchMachine = useCallback(async () => {
        if (!id) return;
        try {
            const response = await fetch(`/api/lab/machines/${id}`);
            if (!response.ok) throw new Error();
            const data = await response.json();
            setMachine(data);
            setOriginalMachine(data);
        } catch {
            setMachine(null);
        } finally {
            setLoading(false);
        }
    }, [id]);

    const fetchMovements = useCallback(async () => {
        if (!id) return;
        try {
            const response = await fetch(`/api/lab/machines/${id}/movements`);
            if (response.ok) setMovements(await response.json());
        } catch { /* non-fatal */ }
    }, [id]);

    useEffect(() => {
        fetchMachine();
        fetchMovements();
    }, [fetchMachine, fetchMovements]);

    // Undo deletes the wrong ledger row and restores the prior location — it never
    // appends a reverse move. The server only permits the component's LATEST movement.
    const handleUndoMovement = useCallback(async (mv: LabMovement) => {
        const what = `${mv.componentLabel || `component ${mv.componentId}`}: ${mv.fromMachineName || 'Shelf'} → ${mv.toMachineName || 'Shelf'}`;
        if (!window.confirm(`Undo this move?\n\n${what}\n\nThe ledger row is deleted and the part returns to ${mv.fromMachineName || 'the shelf'}.`)) return;
        const res = await fetch(`/api/lab/components/${mv.componentId}/movements/${mv.id}`, { method: 'DELETE' });
        if (res.ok) {
            showSnackbar('Move undone');
            fetchMachine(); fetchMovements();
        } else {
            showSnackbar(await res.text() || 'Undo failed', 'error');
        }
    }, [fetchMachine, fetchMovements, showSnackbar]);

    // Eligible-for-undo within this machine's view: the newest movement per component.
    // The server enforces the true global rule; this only decides where to show the button.
    const latestMovementByComponent = useMemo(() => {
        const m = new Map<number, number>();
        for (const mv of movements) if (!m.has(mv.componentId)) m.set(mv.componentId, mv.id);
        return m;
    }, [movements]);

    // Text fields update local state on change and commit on blur — per-keystroke
    // autosave persists half-typed values if the user navigates away mid-debounce
    // (that is how a role of "Ri" once reached the DB).
    const setField = (field: keyof LabMachine, value: string | boolean | null) => {
        if (!machine) return;
        setMachine({ ...machine, [field]: value });
    };

    const setFieldAndSave = (field: keyof LabMachine, value: string | boolean | null) => {
        if (!machine) return;
        const updated = { ...machine, [field]: value };
        setMachine(updated);
        autoSave.save(updated, { immediate: true });
    };

    const commitFields = () => {
        if (machine) autoSave.save(machine, { immediate: true });
    };

    const handleDelete = async () => {
        if (!machine) return;
        if (!window.confirm(`Permanently delete ${machine.name}? Its components move to the shelf, but this machine's movement history and attachments are erased. To decommission a real machine and keep its history, set its status to Retired instead.`)) return;
        try {
            const response = await fetch(`/api/lab/machines/${machine.id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error(await response.text());
            navigate('/homelab/machines');
        } catch (err) {
            showSnackbar(`Failed to delete: ${errorMessage(err)}`, "error");
        }
    };

    // ---- Components section ----

    const openInstallDialog = async () => {
        try {
            // in-service = everything not retired (sold, dead, damaged, lost, disposed):
            // you cannot install a part you no longer have.
            const response = await fetch('/api/lab/components?machineId=0&status=in-service');
            if (response.ok) {
                setShelfComponents(await response.json());
            }
        } catch { setShelfComponents([]); }
        setInstallComponentId('');
        setInstallSlot('');
        setInstallDate('');
        setInstallDialogOpen(true);
    };

    const handleInstall = async () => {
        if (installComponentId === '' || !machine) return;
        try {
            const response = await fetch(`/api/lab/components/${installComponentId}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toMachineId: machine.id,
                    slotLabel: installSlot.trim() || null,
                    movedAt: installDate ? `${installDate}T12:00:00Z` : null,
                    reason: 'Installed',
                }),
            });
            if (!response.ok) throw new Error(await response.text());
            setInstallDialogOpen(false);
            showSnackbar('Component installed', 'success');
            fetchMachine();
            fetchMovements();
        } catch (err) {
            showSnackbar(`Failed to install: ${errorMessage(err)}`, 'error');
        }
    };

    const handleRemove = async (component: LabComponent) => {
        if (!window.confirm(`Remove ${componentLabel(component)} to the shelf?`)) return;
        try {
            const response = await fetch(`/api/lab/components/${component.id}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toMachineId: null, reason: 'Removed to shelf' }),
            });
            if (!response.ok) throw new Error(await response.text());
            showSnackbar('Component moved to shelf', 'info');
            fetchMachine();
            fetchMovements();
        } catch (err) {
            showSnackbar(`Failed to remove: ${errorMessage(err)}`, 'error');
        }
    };

    // ---- Timeline section ----

    const handleTimelineView = async () => {
        if (!timelineDate || !id) return;
        try {
            // End-of-day so "on this date" includes the whole day
            const response = await fetch(`/api/lab/machines/${id}/timeline?date=${timelineDate}T23:59:59Z`);
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            setTimelineLoadout(data.components);
            setTimelineAsOf(timelineDate);
        } catch (err) {
            showSnackbar(`Failed to load timeline: ${errorMessage(err)}`, 'error');
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', padding: 3 }}>
                <CircularProgress size={24} />
            </Box>
        );
    }

    if (!machine) {
        return (
            <Box sx={{ padding: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>Machine not found</Typography>
                <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/homelab/machines')}>
                    Back to Machines
                </Button>
            </Box>
        );
    }

    const statusInfo = getMachineStatusInfo(machine.status);
    const installed = machine.installedComponents || [];

    return (
        <Box sx={{ padding: 2 }}>
            {/* Page header: title left, Back/Delete right */}
            <Box sx={CONFIGURE_PAGE_HEADER_SX}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <span style={{ fontSize: '1.4rem' }}>{machineEmoji(machine)}</span>
                    <Typography variant="h6">{machine.name}</Typography>
                    <Chip label={statusInfo.label} color={statusInfo.color} size="small" variant="outlined" />
                    {machine.role && <Chip label={machine.role} size="small" />}
                    {autoSave.status === 'saving' && <Chip label="Saving…" size="small" color="info" variant="outlined" />}
                    {autoSave.status === 'saved' && <Chip label="Saved" size="small" color="success" variant="outlined" />}
                    {autoSave.status === 'error' && <Chip label="Save failed" size="small" color="error" variant="outlined" />}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" size="small" startIcon={<ArrowBackIcon />} onClick={() => navigate('/homelab/machines')}>
                        Back
                    </Button>
                    <Button
                        variant="outlined" size="small" color="warning"
                        onClick={() => setFieldAndSave('status', machine.status === 'retired' ? 'active' : 'retired')}
                    >
                        {machine.status === 'retired' ? 'Reactivate' : 'Retire'}
                    </Button>
                    <Button variant="outlined" size="small" color="error" startIcon={<DeleteIcon />} onClick={handleDelete}>
                        Delete
                    </Button>
                </Box>
            </Box>

            {/* Details */}
            <Accordion expanded={detailsExpanded} onChange={() => setDetailsExpanded(!detailsExpanded)} sx={{ mb: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                        <InfoIcon color="primary" />
                        <Typography variant="h6" sx={{ fontSize: '1rem' }}>Machine Details</Typography>
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <Box sx={getFieldGridSx(true)}>
                        <TextField
                            label="Name" size="small" required
                            value={machine.name}
                            onChange={(e) => setField('name', e.target.value)}
                            onBlur={commitFields}
                        />
                        <TextField
                            label="Hostname" size="small"
                            value={machine.hostname || ''}
                            onChange={(e) => setField('hostname', e.target.value || null)}
                            onBlur={commitFields}
                        />
                        <TextField
                            label="Kind" size="small" select
                            value={machine.kind || ''}
                            onChange={(e) => setFieldAndSave('kind', e.target.value || null)}
                        >
                            <MenuItem value="">{'\u2014'}</MenuItem>
                            {MACHINE_KINDS.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                        </TextField>
                        <TextField
                            label="Role" size="small"
                            value={machine.role || ''}
                            onChange={(e) => setField('role', e.target.value || null)}
                            onBlur={commitFields}
                        />
                        <TextField
                            label="Status" size="small" select
                            value={machine.status}
                            onChange={(e) => setFieldAndSave('status', e.target.value)}
                        >
                            {MACHINE_STATUS_OPTIONS.map(s => (
                                <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            label="OS" size="small"
                            value={machine.os || ''}
                            onChange={(e) => setField('os', e.target.value || null)}
                            onBlur={commitFields}
                        />
                        <TextField
                            label="IP Address" size="small"
                            value={machine.ipAddress || ''}
                            onChange={(e) => setField('ipAddress', e.target.value || null)}
                            onBlur={commitFields}
                        />
                        <TextField
                            label="Location" size="small"
                            value={machine.location || ''}
                            onChange={(e) => setField('location', e.target.value || null)}
                            onBlur={commitFields}
                        />
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={machine.alwaysOn}
                                    onChange={(e) => setFieldAndSave('alwaysOn', e.target.checked)}
                                    size="small"
                                />
                            }
                            label="Always on"
                        />
                        <TextField
                            label="Notes" size="small" multiline rows={3}
                            value={machine.notes || ''}
                            onChange={(e) => setField('notes', e.target.value || null)}
                            onBlur={commitFields}
                            sx={CONFIGURE_FIELD_FULL_WIDTH_SX}
                        />
                    </Box>
                </AccordionDetails>
            </Accordion>

            {/* Components */}
            <Accordion expanded={componentsExpanded} onChange={() => setComponentsExpanded(!componentsExpanded)} sx={{ mb: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ pr: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <MemoryIcon color="primary" />
                            <Typography variant="h6" sx={{ fontSize: '1rem' }}>
                                Installed Components ({installed.length})
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }} onClick={(e) => e.stopPropagation()}>
                            <Button
                                variant="contained"
                                color="primary"
                                size="small"
                                startIcon={<AddIcon />}
                                onClick={(e) => { e.stopPropagation(); openInstallDialog(); }}
                            >
                                Install from Shelf
                            </Button>
                        </Box>
                    </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ p: 0 }}>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'action.hover' }}>
                                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Type</TableCell>
                                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Component</TableCell>
                                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Spec</TableCell>
                                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }} align="right">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {installed.length > 0 ? installed.map((c) => (
                                    <TableRow key={c.id} hover>
                                        <TableCell>
                                            <Chip label={c.type} size="small" />
                                        </TableCell>
                                        <TableCell>
                                            {/* The name is the way into the component's own page - its
                                                history, its market value over time, its invoice. Before
                                                this the only click target was the edit modal. */}
                                            <Typography
                                                fontWeight="medium"
                                                onClick={() => navigate(`/homelab/component/${c.id}`)}
                                                sx={{
                                                    cursor: 'pointer',
                                                    '&:hover': { textDecoration: 'underline' }
                                                }}
                                            >
                                                {componentLabel(c)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">{c.spec || '—'}</Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="Remove to shelf">
                                                <IconButton size="small" color="warning" onClick={() => handleRemove(c)}>
                                                    <EjectIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={4} sx={{ textAlign: 'center', py: 3 }}>
                                            <Typography color="textSecondary">No components installed</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </AccordionDetails>
            </Accordion>

            {/* Timeline */}
            <Accordion expanded={timelineExpanded} onChange={() => setTimelineExpanded(!timelineExpanded)}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                        <HistoryIcon color="primary" />
                        <Typography variant="h6" sx={{ fontSize: '1rem' }}>
                            Timeline ({movements.length} movement{movements.length === 1 ? '' : 's'})
                        </Typography>
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    {/* As-of-date loadout viewer */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                        <TextField
                            label="What did this machine look like on…"
                            type="date"
                            size="small"
                            value={timelineDate}
                            onChange={(e) => setTimelineDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={{ minWidth: 240 }}
                        />
                        <Button variant="outlined" size="small" onClick={handleTimelineView} disabled={!timelineDate}>
                            View
                        </Button>
                        {timelineAsOf && timelineLoadout && (
                            <Chip
                                label={`${timelineLoadout.length} component${timelineLoadout.length === 1 ? '' : 's'} on ${timelineAsOf}`}
                                size="small"
                                color="info"
                                variant="outlined"
                                onDelete={() => { setTimelineLoadout(null); setTimelineAsOf(null); }}
                            />
                        )}
                    </Box>

                    {timelineLoadout && (
                        <Box sx={{ mb: 2 }}>
                            {timelineLoadout.length > 0 ? timelineLoadout.map((c) => (
                                <Typography key={c.id} variant="body2" sx={{ py: 0.25 }}>
                                    <Chip label={c.type} size="small" sx={{ mr: 1 }} />
                                    {componentLabel(c)}{c.spec ? ` — ${c.spec}` : ''}
                                </Typography>
                            )) : (
                                <Typography variant="body2" color="text.secondary">
                                    No components were installed on that date.
                                </Typography>
                            )}
                        </Box>
                    )}

                    {/* Movement history */}
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'action.hover' }}>
                                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Date</TableCell>
                                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Component</TableCell>
                                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>From</TableCell>
                                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>To</TableCell>
                                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Reason</TableCell>
                                    <TableCell sx={{ width: 48 }} />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {movements.length > 0 ? movements.map((mv) => (
                                    <TableRow key={mv.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                                                {new Date(mv.movedAt).toLocaleDateString()}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">
                                                {mv.componentLabel || `#${mv.componentId}`}
                                                {mv.slotLabel ? ` (${mv.slotLabel})` : ''}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">
                                                {mv.fromMachineName || 'Shelf'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">
                                                {mv.toMachineName || 'Shelf'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">{mv.reason || '—'}</Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            {latestMovementByComponent.get(mv.componentId) === mv.id && (
                                                <Tooltip title="Undo this move (deletes the ledger row, part returns to its prior location)">
                                                    <IconButton size="small" onClick={() => handleUndoMovement(mv)}>
                                                        <UndoIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={6} sx={{ textAlign: 'center', py: 3 }}>
                                            <Typography color="textSecondary">No movements recorded yet</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </AccordionDetails>
            </Accordion>

            {/* Install-from-shelf dialog */}
            <Dialog open={installDialogOpen} onClose={() => { setInstallDialogOpen(false); setInstallQuery(''); }} maxWidth="xs" fullWidth>
                <DialogTitle>Install Component</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                        <LabPickerSearch value={installQuery} onChange={setInstallQuery}
                            placeholder="Search the shelf..." matchCount={shelfFiltered.length}
                            sx={{ mb: 0 }} />
                        <TextField
                            label="Component (on shelf)"
                            size="small" select fullWidth
                            value={installComponentId}
                            onChange={(e) => setInstallComponentId(Number(e.target.value))}
                        >
                            {shelfComponents.length === 0 && (
                                <MenuItem disabled value="">No components on the shelf</MenuItem>
                            )}
                            {shelfComponents.length > 0 && shelfFiltered.length === 0 && (
                                <MenuItem disabled value="">No shelf component matches "{installQuery}"</MenuItem>
                            )}
                            {/* Grouped under type headers in the vocabulary's own order - a type
                                repeated on every row makes a long shelf hard to scan. */}
                            {shelfGrouped.flatMap(([type, items]) => [
                                <ListSubheader key={`h-${type}`}>{type}</ListSubheader>,
                                ...items.map(c => (
                                    <MenuItem key={c.id} value={c.id}>{componentLabel(c)}</MenuItem>
                                )),
                            ])}
                        </TextField>
                        <TextField
                            label="Slot (optional)"
                            size="small"
                            value={installSlot}
                            onChange={(e) => setInstallSlot(e.target.value)}
                            placeholder='e.g. "M.2 4.0 x4 (CPU)", "3.5 Disk 2"'
                        />
                        <TextField
                            label="Install date (optional)"
                            type="date" size="small"
                            value={installDate}
                            onChange={(e) => setInstallDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            helperText="Leave empty for now; backdate for imports"
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setInstallDialogOpen(false); setInstallQuery(''); }}>Cancel</Button>
                    <Button onClick={handleInstall} variant="contained" disabled={installComponentId === ''}>
                        Install
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={6000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setSnackMessage(null)} severity={snackbarSeverity} sx={{ width: "100%" }}>
                    {snackMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default ConfigureMachine;
