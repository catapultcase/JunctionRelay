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
    Switch,
    Box,
} from "@mui/material";
import { type LabMachine, MACHINE_STATUS_OPTIONS, MACHINE_KINDS } from './Lab_Machines_Helpers';
import { errorMessage } from '../utils/errors';

interface LabMachineAddModalProps {
    open: boolean;
    onClose: () => void;
    onSaved: (machine: LabMachine) => void;
    onError: (message: string) => void;
    machine?: LabMachine | null;   // present = edit mode
}

const emptyForm = {
    name: '',
    hostname: '',
    kind: '',
    role: '',
    status: 'active',
    os: '',
    ipAddress: '',
    location: '',
    alwaysOn: false,
    notes: '',
};

const LabMachineAddModal: React.FC<LabMachineAddModalProps> = ({ open, onClose, onSaved, onError, machine }) => {
    const isEdit = Boolean(machine);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) {
            setForm(machine ? {
                name: machine.name || '',
                hostname: machine.hostname || '',
                kind: machine.kind || '',
                role: machine.role || '',
                status: machine.status || 'active',
                os: machine.os || '',
                ipAddress: machine.ipAddress || '',
                location: machine.location || '',
                alwaysOn: machine.alwaysOn || false,
                notes: machine.notes || '',
            } : emptyForm);
        }
    }, [open, machine]);

    const setField = (field: string, value: string | boolean) =>
        setForm(prev => ({ ...prev, [field]: value }));

    const handleSave = async () => {
        if (!form.name.trim()) {
            onError('Machine name is required');
            return;
        }
        setSaving(true);
        try {
            const url = isEdit ? `/api/lab/machines/${machine!.id}` : '/api/lab/machines';
            const response = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    id: isEdit ? machine!.id : 0,
                    name: form.name.trim(),
                    hostname: form.hostname.trim() || null,
                    kind: form.kind || null,
                    role: form.role.trim() || null,
                    os: form.os.trim() || null,
                    ipAddress: form.ipAddress.trim() || null,
                    location: form.location.trim() || null,
                    notes: form.notes.trim() || null,
                }),
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            const saved = await response.json();
            onSaved(saved);
            onClose();
        } catch (err) {
            onError(`Failed to ${isEdit ? 'update' : 'add'} machine: ${errorMessage(err)}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{isEdit ? 'Edit Machine' : 'Add Machine'}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <TextField
                        label="Name"
                        value={form.name}
                        onChange={(e) => setField('name', e.target.value)}
                        required
                        size="small"
                        autoFocus
                        placeholder='Spoken name, e.g. "workstation"'
                    />
                    <TextField
                        label="Hostname"
                        value={form.hostname}
                        onChange={(e) => setField('hostname', e.target.value)}
                        size="small"
                        placeholder="What the machine actually reports"
                    />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="Kind"
                            value={form.kind}
                            onChange={(e) => setField('kind', e.target.value)}
                            size="small"
                            select
                            fullWidth
                        >
                            <MenuItem value="">—</MenuItem>
                            {MACHINE_KINDS.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
                        </TextField>
                        <TextField
                            label="Role"
                            value={form.role}
                            onChange={(e) => setField('role', e.target.value)}
                            size="small"
                            fullWidth
                            placeholder="NAS, Gaming, LLM…"
                        />
                        <TextField
                            label="Status"
                            value={form.status}
                            onChange={(e) => setField('status', e.target.value)}
                            size="small"
                            select
                            fullWidth
                        >
                            {MACHINE_STATUS_OPTIONS.map(s => (
                                <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
                            ))}
                        </TextField>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="OS"
                            value={form.os}
                            onChange={(e) => setField('os', e.target.value)}
                            size="small"
                            fullWidth
                        />
                        <TextField
                            label="IP Address"
                            value={form.ipAddress}
                            onChange={(e) => setField('ipAddress', e.target.value)}
                            size="small"
                            fullWidth
                        />
                    </Box>
                    <TextField
                        label="Location"
                        value={form.location}
                        onChange={(e) => setField('location', e.target.value)}
                        size="small"
                        placeholder="Rack, office, closet…"
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={form.alwaysOn}
                                onChange={(e) => setField('alwaysOn', e.target.checked)}
                                size="small"
                            />
                        }
                        label="Always on"
                    />
                    <TextField
                        label="Notes"
                        value={form.notes}
                        onChange={(e) => setField('notes', e.target.value)}
                        size="small"
                        multiline
                        rows={3}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" disabled={saving}>
                    {isEdit ? 'Save' : 'Add Machine'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default LabMachineAddModal;
