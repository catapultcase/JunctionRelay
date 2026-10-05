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

import React, { useState, useEffect, useMemo } from "react";
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    MenuItem,
    Checkbox,
    ListItemText,
    Chip,
    Box,
} from "@mui/material";
import { type LabMachine } from './Lab_Machines_Helpers';

// A machine group: machines whose <field> value is in `values` belong to it.
// NO_VALUE is the bucket for machines without a value in that field.
export const NO_VALUE = '(none)';

export const GROUP_FIELDS: { key: string, label: string }[] = [
    { key: 'kind', label: 'Kind' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
    { key: 'os', label: 'OS' },
    { key: 'location', label: 'Location' },
];

export interface MachineGroup {
    id: number;
    name: string;
    field: string;         // one of GROUP_FIELDS keys
    values: string[];
}

export const machineFieldValue = (m: LabMachine, field: string): string => {
    const raw =
        field === 'kind' ? m.kind :
        field === 'role' ? m.role :
        field === 'status' ? m.status :
        field === 'os' ? m.os :
        field === 'location' ? m.location : null;
    return (raw && String(raw).trim()) || NO_VALUE;
};

interface LabMachineGroupDialogProps {
    open: boolean;
    onClose: () => void;
    onSave: (group: Omit<MachineGroup, 'id'> & { id?: number }) => void;
    group?: MachineGroup | null;      // present = edit mode
    machines: LabMachine[];           // for deriving available values per field
}

const LabMachineGroupDialog: React.FC<LabMachineGroupDialogProps> = ({ open, onClose, onSave, group, machines }) => {
    const isEdit = Boolean(group);
    const [name, setName] = useState('');
    const [field, setField] = useState('kind');
    const [values, setValues] = useState<string[]>([]);

    useEffect(() => {
        if (open) {
            setName(group?.name ?? '');
            setField(group?.field ?? 'kind');
            setValues(group?.values ?? []);
        }
    }, [open, group]);

    // Distinct values of the chosen field across machines, "(none)" last
    const availableValues = useMemo(() => {
        const vals = new Set<string>(machines.map(m => machineFieldValue(m, field)));
        return Array.from(vals).sort((a, b) =>
            a === NO_VALUE ? 1 : b === NO_VALUE ? -1 : a.localeCompare(b));
    }, [machines, field]);

    // Offer current values PLUS anything already selected — stale stays deselectable
    const menuValues = Array.from(new Set([...availableValues, ...values]));

    const handleFieldChange = (newField: string) => {
        setField(newField);
        setValues([]);   // values belong to a field
    };

    const fieldLabel = GROUP_FIELDS.find(f => f.key === field)?.label ?? field;

    const handleSave = () => {
        if (values.length === 0) return;
        onSave({
            id: group?.id,
            name: name.trim() || values.join(' / '),
            field,
            values,
        });
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>{isEdit ? 'Edit Group' : 'Add Group'}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <TextField
                        label="Group name"
                        size="small"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={values.length > 0 ? values.join(' / ') : 'e.g. Servers'}
                        helperText="Optional — defaults to the selected values"
                    />
                    <TextField
                        label="Group by"
                        size="small" select
                        value={field}
                        onChange={(e) => handleFieldChange(e.target.value)}
                    >
                        {GROUP_FIELDS.map(f => (
                            <MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        label={`Include machines with these ${fieldLabel.toLowerCase()} values`}
                        size="small" select required
                        value={values}
                        onChange={(e) => {
                                // A multiple select hands back an array, though the TextField event types it as a string
                                const selected: unknown = e.target.value;
                                setValues(Array.isArray(selected)
                                    ? selected.filter((v): v is string => typeof v === 'string')
                                    : String(selected).split(','));
                            }}
                        SelectProps={{
                            multiple: true,
                            renderValue: () => (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {values.map((v) => (
                                        <Chip key={v} label={v} size="small" />
                                    ))}
                                </Box>
                            ),
                        }}
                    >
                        {menuValues.map((v) => (
                            <MenuItem key={v} value={v}>
                                <Checkbox size="small" checked={values.includes(v)} />
                                <ListItemText
                                    primary={v}
                                    secondary={availableValues.includes(v) ? undefined : `unused — no machine has this ${fieldLabel.toLowerCase()}`}
                                />
                            </MenuItem>
                        ))}
                    </TextField>
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" disabled={values.length === 0}>
                    {isEdit ? 'Save' : 'Add Group'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default LabMachineGroupDialog;
