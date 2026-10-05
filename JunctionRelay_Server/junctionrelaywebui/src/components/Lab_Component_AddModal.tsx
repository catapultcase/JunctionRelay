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

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    MenuItem,
    FormControlLabel,
    Checkbox,
    Box,
    Typography,
    Divider,
} from "@mui/material";
import {
    type LabComponentFull,
    type ComponentSpec,
    COMPONENT_SOURCES,
    COMPONENT_TYPE_EMOJI,
    SETTABLE_STATUSES,
    isRetiredStatus,
    componentDisplayName,
    fromUsDate,
    composeSpecString,
} from './Lab_Inventory_Helpers';
import { useComponentTypes } from './Lab_ComponentTypes_Client';
import { errorMessage } from '../utils/errors';

interface LabComponentAddModalProps {
    open: boolean;
    onClose: () => void;
    onSaved: (component: LabComponentFull) => void;
    onError: (message: string) => void;
    defaultType?: string;                  // preselect type (section Add buttons)
}

const emptyForm = {
    type: 'CPU',
    status: 'spare',
    parentComponentId: '',
    name: '',
    manufacturer: '',
    model: '',
    nickname: '',
    serialNumber: '',
    releaseYear: '',
    msrp: '',
    listPrice: '',
    listPriceDate: '',
    purchasePrice: '',
    acquiredAt: '',
    source: '',
    warrantyYears: '',
    vendor: '',
    listPriceNotes: '',
    notes: '',
};

// ⛔ ADD ONLY. Editing lives on the component page (pages/lab/ViewComponent.tsx), where Type IS
// editable. There is no second editing implementation here: one is exactly the thing someone
// wires back up by accident.
const LabComponentAddModal: React.FC<LabComponentAddModalProps> = ({ open, onClose, onSaved, onError, defaultType }) => {
    const { typeNames, fieldsFor } = useComponentTypes();
    const [form, setForm] = useState(emptyForm);
    const [spec, setSpec] = useState<ComponentSpec>({});
    const [saving, setSaving] = useState(false);
    const [candidates, setCandidates] = useState<LabComponentFull[]>([]);

    // Possible parents for an integrated part. Cheap enough to refetch per open, and
    // that way a part added moments ago is selectable without a page reload.
    useEffect(() => {
        if (!open) return;
        fetch('/api/lab/components')
            .then(r => (r.ok ? r.json() : []))
            .then(setCandidates)
            .catch(() => setCandidates([]));
    }, [open]);

    // Purchase facts come from the parent when this part came inside one.
    const inherited = Boolean(form.parentComponentId);
    const parentLabel = candidates.find(c => String(c.id) === form.parentComponentId);

    useEffect(() => {
        if (open) {
            setForm({ ...emptyForm, type: defaultType || typeNames[0] || 'Other' });
            setSpec({});
        }
    }, [open, defaultType, typeNames]);

    const setField = (field: string, value: string) =>
        setForm(prev => ({ ...prev, [field]: value }));

    const handleTypeChange = (newType: string) => {
        setForm(prev => ({ ...prev, type: newType }));
        setSpec({});   // spec fields differ per type
    };

    const setSpecField = (key: string, value: string | number | boolean | null) =>
        setSpec(prev => ({ ...prev, [key]: value }));

    const specFields = fieldsFor(form.type);

    const handleSave = async () => {
        if (!form.type) {
            onError('Component type is required');
            return;
        }
        // Typed dates get checked rather than coerced: a half-typed "11/7" silently
        // saved as nothing (or as a wrong day) is worse than being told to fix it.
        const acquiredIso = fromUsDate(form.acquiredAt);
        if (form.acquiredAt.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(acquiredIso)) {
            onError('Acquired must be a full date as MM/DD/YYYY');
            return;
        }
        const releaseIso = fromUsDate(form.releaseYear);
        if (form.releaseYear.trim() && !/^\d{4}(-\d{2}-\d{2})?$/.test(releaseIso)) {
            onError('Release date must be MM/DD/YYYY, or just a year');
            return;
        }
        const listPriceIso = fromUsDate(form.listPriceDate);
        if (form.listPriceDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(listPriceIso)) {
            onError('List price date must be a full date as MM/DD/YYYY');
            return;
        }
        setSaving(true);
        try {
            // Drop empty spec values, compose the display string from the rest
            const cleanSpec: ComponentSpec = {};
            for (const [k, v] of Object.entries(spec)) {
                if (v !== '' && v !== null && v !== undefined && v !== false) cleanSpec[k] = v;
            }
            const specString = composeSpecString(form.type, cleanSpec);

            const url = '/api/lab/components';
            const body = {
                id: 0,
                type: form.type,
                name: form.name.trim() || null,
                manufacturer: form.manufacturer.trim() || null,
                model: form.model.trim() || null,
                nickname: form.nickname.trim() || null,
                serialNumber: form.serialNumber.trim() || null,
                spec: specString || null,
                specJson: Object.keys(cleanSpec).length > 0 ? JSON.stringify(cleanSpec) : null,
                releaseDate: releaseIso || null,
                msrp: form.msrp ? parseFloat(form.msrp) : null,
                listPrice: form.listPrice ? parseFloat(form.listPrice) : null,
                listPriceDate: listPriceIso || null,
                listPriceNotes: form.listPriceNotes.trim() || null,
                purchasePrice: form.purchasePrice ? parseFloat(form.purchasePrice) : null,
                acquiredAt: acquiredIso ? `${acquiredIso}T12:00:00Z` : null,
                source: form.source || null,
                warrantyYears: form.warrantyYears ? parseInt(form.warrantyYears, 10) : null,
                vendor: form.vendor.trim() || null,
                notes: form.notes.trim() || null,
                status: form.status,
                // Integrated part: the server clears the inherited purchase fields and
                // serves the parent's on read, so whatever sits in those boxes is display.
                parentComponentId: form.parentComponentId ? parseInt(form.parentComponentId, 10) : null,
            };
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!response.ok) throw new Error(await response.text());
            const saved = await response.json();
            onSaved(saved);
            onClose();
        } catch (err) {
            onError(`Failed to add component: ${errorMessage(err)}`);
        } finally {
            setSaving(false);
        }
    };

    const renderSpecField = (f: typeof specFields[number]) => {
        const value = spec[f.key];
        switch (f.kind) {
            case 'boolean':
                return (
                    <FormControlLabel
                        key={f.key}
                        control={
                            <Checkbox
                                size="small"
                                checked={Boolean(value)}
                                onChange={(e) => setSpecField(f.key, e.target.checked)}
                            />
                        }
                        label={f.label}
                    />
                );
            case 'select':
                return (
                    <TextField
                        key={f.key} label={f.label} size="small" select
                        value={value ?? ''}
                        onChange={(e) => setSpecField(f.key, e.target.value || null)}
                    >
                        <MenuItem value="">—</MenuItem>
                        {(f.options ?? []).map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                    </TextField>
                );
            case 'number':
                return (
                    <TextField
                        key={f.key} label={f.unit ? `${f.label} (${f.unit.trim()})` : f.label} size="small" type="number"
                        value={value ?? ''}
                        onChange={(e) => setSpecField(f.key, e.target.value === '' ? null : Number(e.target.value))}
                    />
                );
            default:
                return (
                    <TextField
                        key={f.key} label={f.label} size="small"
                        value={value ?? ''}
                        onChange={(e) => setSpecField(f.key, e.target.value || null)}
                        multiline={f.multiline}
                        rows={f.multiline ? 3 : undefined}
                        sx={f.multiline ? { gridColumn: '1 / -1' } : undefined}
                    />
                );
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Add Component</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="Type" size="small" select required fullWidth
                            value={form.type}
                            onChange={(e) => handleTypeChange(e.target.value)}
                        >
                            {typeNames.map(t => (
                                <MenuItem key={t} value={t}>
                                    {COMPONENT_TYPE_EMOJI[t] || '⚙️'}&nbsp;&nbsp;{t}
                                </MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            label="Status" size="small" select fullWidth
                            value={form.status}
                            onChange={(e) => setField('status', e.target.value)}
                            helperText={
                                form.status === 'active'
                                    ? 'Installed in a machine — set which one after saving, from the component page'
                                    : isRetiredStatus(form.status)
                                        ? 'Retired — shown in the Graveyard, left out of fleet totals'
                                        : SETTABLE_STATUSES.find(s => s.value === form.status)?.help
                            }
                        >
                            {/* Active is not a choice — a part becomes active by being
                                installed — but an installed part must still show its own
                                status here, and retiring it from this list takes it out. */}
                            {form.status === 'active' && <MenuItem value="active">Active</MenuItem>}
                            {SETTABLE_STATUSES.map(s => (
                                <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                            ))}
                        </TextField>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="Name" size="small" fullWidth
                            value={form.name ?? ''}
                            onChange={(e) => setField('name', e.target.value)}
                            placeholder="Only if manufacturer + model won't do"
                        />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="Manufacturer" size="small" fullWidth
                            value={form.manufacturer}
                            onChange={(e) => setField('manufacturer', e.target.value)}
                            placeholder="AMD, Corsair, Samsung…"
                        />
                        <TextField
                            label="Model" size="small" fullWidth autoFocus
                            value={form.model}
                            onChange={(e) => setField('model', e.target.value)}
                            placeholder="9800X3D, RTX 4080…"
                        />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="Nickname" size="small" fullWidth
                            value={form.nickname}
                            onChange={(e) => setField('nickname', e.target.value)}
                            placeholder='"Tank", "Vault"…'
                        />
                        <TextField
                            label="Serial Number" size="small" fullWidth
                            value={form.serialNumber}
                            onChange={(e) => setField('serialNumber', e.target.value)}
                        />
                    </Box>

                    {specFields.length > 0 && (
                        <>
                            <Divider>
                                <Typography variant="caption" color="text.secondary">
                                    {COMPONENT_TYPE_EMOJI[form.type]} {form.type} specs
                                </Typography>
                            </Divider>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                                {specFields.map(renderSpecField)}
                            </Box>
                        </>
                    )}

                    <Divider>
                        <Typography variant="caption" color="text.secondary">Purchase</Typography>
                    </Divider>
                    <TextField
                        label="Part of (came integrated in)" size="small" select fullWidth
                        value={form.parentComponentId}
                        onChange={(e) => setField('parentComponentId', e.target.value)}
                        helperText={inherited
                            ? `Bought as part of ${parentLabel ? componentDisplayName(parentLabel) : 'another part'} — acquired date, vendor and warranty follow it; the price stays on it.`
                            : 'For iGPUs, soldered CPUs, bundled cases — anything that arrived inside another part.'}
                    >
                        <MenuItem value="">— bought on its own —</MenuItem>
                        {candidates
                            .map(c => (
                                <MenuItem key={c.id} value={String(c.id)}>
                                    {COMPONENT_TYPE_EMOJI[c.type] || '⚙️'}&nbsp;&nbsp;{componentDisplayName(c)}
                                </MenuItem>
                            ))}
                    </TextField>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="Release Date" size="small" fullWidth
                            value={form.releaseYear}
                            onChange={(e) => setField('releaseYear', e.target.value)}
                            placeholder="11/07/2024 or 2024"
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            label="MSRP" size="small" fullWidth type="number"
                            value={form.msrp}
                            onChange={(e) => setField('msrp', e.target.value)}
                        />
                        <TextField
                            label="Purchase Price" size="small" fullWidth type="number"
                            value={form.purchasePrice}
                            onChange={(e) => setField('purchasePrice', e.target.value)}
                            disabled={inherited}
                            helperText={inherited ? 'Paid on the parent' : undefined}
                        />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="Acquired" size="small" fullWidth
                            value={form.acquiredAt}
                            onChange={(e) => setField('acquiredAt', e.target.value)}
                            placeholder="MM/DD/YYYY"
                            InputLabelProps={{ shrink: true }}
                            disabled={inherited}
                        />
                        <TextField
                            label="Source" size="small" select fullWidth
                            value={form.source}
                            onChange={(e) => setField('source', e.target.value)}
                        >
                            <MenuItem value="">—</MenuItem>
                            {COMPONENT_SOURCES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                        </TextField>
                        <TextField
                            label="Warranty (yrs)" size="small" fullWidth type="number"
                            value={form.warrantyYears}
                            onChange={(e) => setField('warrantyYears', e.target.value)}
                            disabled={inherited}
                        />
                        <TextField
                            label="Vendor" size="small" fullWidth
                            value={form.vendor}
                            onChange={(e) => setField('vendor', e.target.value)}
                            placeholder="Newegg, Amazon, Micro Center…"
                            disabled={inherited}
                        />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="List @ Purchase" size="small" fullWidth type="number"
                            value={form.listPrice}
                            onChange={(e) => setField('listPrice', e.target.value)}
                            helperText="What it listed for the day you bought it - from the invoice"
                        />
                        <TextField
                            label="List price date" size="small" fullWidth
                            value={form.listPriceDate}
                            onChange={(e) => setField('listPriceDate', e.target.value)}
                            placeholder="MM/DD/YYYY"
                            InputLabelProps={{ shrink: true }}
                            helperText="When that list price was true"
                        />
                    </Box>
                    <TextField
                        label="List price note" size="small" multiline rows={2}
                        value={form.listPriceNotes}
                        onChange={(e) => setField('listPriceNotes', e.target.value)}
                        placeholder='e.g. "RAM doubled in price last month - verified 8/2026"'
                        helperText="Considered on the next price refresh; if no newer verified price is found, the current one stands."
                    />
                    <TextField
                        label="Notes" size="small" multiline rows={2}
                        value={form.notes}
                        onChange={(e) => setField('notes', e.target.value)}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" disabled={saving}>
                    Add Component
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default LabComponentAddModal;
