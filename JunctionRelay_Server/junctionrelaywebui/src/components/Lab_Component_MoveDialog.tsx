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
    Box,
    Typography,
    ListSubheader,
} from "@mui/material";
import { type LabComponentFull, componentDisplayName } from './Lab_Inventory_Helpers';
import { type LabMachine } from './Lab_Machines_Helpers';
import { errorMessage } from '../utils/errors';

// ⛔ TWO DESTINATIONS, TWO WRITES. A machine and a space are not the same kind of place and
// are not stored the same way: a machine is a column on the component (CurrentMachineId, moved
// through /move so the history is recorded), a space is a row in Lab_Placements. So the value
// carries its own kind rather than being a bare id - "machine:5" and "space:5" are different
// destinations that would otherwise collide on the number.
//
// 🔑 THESE ARE NOT EXCLUSIVE. A drive lives in a machine AND that machine sits in a rack; a PDU
// sits in a rack and is in no machine at all. Putting a part into a space therefore does NOT
// clear the machine it is in - only Shelf does that, because that is what Shelf means.
const SHELF = 'shelf';
type Destination = string;   // 'shelf' | `machine:${id}` | `space:${id}`

interface LabSpaceOption {
    id: number;
    name: string;
    kind: string;
    heightU?: number | null;
}

interface LabComponentMoveDialogProps {
    open: boolean;
    onClose: () => void;
    onMoved: () => void;
    onError: (message: string) => void;
    component: LabComponentFull | null;
    machines: LabMachine[];
}

const LabComponentMoveDialog: React.FC<LabComponentMoveDialogProps> = ({
    open, onClose, onMoved, onError, component, machines,
}) => {
    const [destination, setDestination] = useState<Destination>(SHELF);
    const [slotLabel, setSlotLabel] = useState('');
    const [movedAt, setMovedAt] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [spaces, setSpaces] = useState<LabSpaceOption[]>([]);
    const [positionU, setPositionU] = useState('');
    const [heightU, setHeightU] = useState('1');

    // ⚠️ Loaded here rather than passed in. Inventory has no other reason to know about spaces,
    // and threading a list through only so this dialog can read it makes the page carry state
    // for a modal that is closed almost all of the time.
    useEffect(() => {
        if (!open) return;
        fetch('/api/lab/spaces')
            .then(r => r.json())
            .then((rows: LabSpaceOption[]) => setSpaces(rows ?? []))
            .catch(() => setSpaces([]));
    }, [open]);

    useEffect(() => {
        if (open && component) {
            // Default destination: shelf when installed, first machine when shelved
            setDestination(component.currentMachineId
                ? SHELF
                : (machines[0] ? `machine:${machines[0].id}` : SHELF));
            setSlotLabel('');
            setMovedAt('');
            setReason('');
            setPositionU('');
            setHeightU('1');
        }
    }, [open, component, machines]);

    const spaceId = destination.startsWith('space:') ? Number(destination.slice(6)) : null;
    const machineId = destination.startsWith('machine:') ? Number(destination.slice(8)) : null;

    const handleMove = async () => {
        if (!component) return;
        setSaving(true);
        try {
            if (spaceId != null) {
                // ⚠️ The server validates fit and overlap - a U already taken, or a span running
                // past the top of the rack - and returns the reason as plain text. Surface it as
                // it comes: "U3 is taken on the front face by 'pfSense Box'" is the whole answer.
                const response = await fetch('/api/lab/spaces/placements', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        spaceId,
                        componentId: component.id,
                        positionU: positionU ? Number(positionU) : null,
                        heightU: heightU ? Number(heightU) : 1,
                        face: 'front',
                        status: 'planned',
                        notes: reason.trim() || null,
                    }),
                });
                if (!response.ok) throw new Error(await response.text());
            } else {
                const response = await fetch(`/api/lab/components/${component.id}/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        toMachineId: machineId,
                        slotLabel: slotLabel.trim() || null,
                        movedAt: movedAt ? `${movedAt}T12:00:00Z` : null,
                        reason: reason.trim() || null,
                    }),
                });
                if (!response.ok) throw new Error(await response.text());
            }
            onMoved();
            onClose();
        } catch (err) {
            onError(`Failed to move component: ${errorMessage(err)}`);
        } finally {
            setSaving(false);
        }
    };

    if (!component) return null;

    const destinationOptions = machines.filter(m => m.id !== component.currentMachineId);
    const racks = spaces.filter(sp => sp.kind === 'Rack');
    const otherSpaces = spaces.filter(sp => sp.kind !== 'Rack');

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Move Component</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        {componentDisplayName(component)} — currently {component.currentMachineName ? `in ${component.currentMachineName}` : 'on the shelf'}
                    </Typography>
                    <TextField
                        label="Destination" size="small" select fullWidth
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                    >
                        {component.currentMachineId && <MenuItem value={SHELF}>Shelf</MenuItem>}
                        {destinationOptions.length > 0 && <ListSubheader>Machines</ListSubheader>}
                        {destinationOptions.map(m => (
                            <MenuItem key={`m${m.id}`} value={`machine:${m.id}`}>{m.name}</MenuItem>
                        ))}
                        {racks.length > 0 && <ListSubheader>Racks</ListSubheader>}
                        {racks.map(sp => (
                            <MenuItem key={`s${sp.id}`} value={`space:${sp.id}`}>
                                {sp.name}{sp.heightU ? ` — ${sp.heightU}U` : ''}
                            </MenuItem>
                        ))}
                        {otherSpaces.length > 0 && <ListSubheader>Other spaces</ListSubheader>}
                        {otherSpaces.map(sp => (
                            <MenuItem key={`s${sp.id}`} value={`space:${sp.id}`}>
                                {sp.name} — {sp.kind}
                            </MenuItem>
                        ))}
                    </TextField>

                    {/* A slot is a machine's word - "M.2 4.0 x4 (CPU)". A rack's word is a U. */}
                    {machineId != null && (
                        <TextField
                            label="Slot (optional)" size="small"
                            value={slotLabel}
                            onChange={(e) => setSlotLabel(e.target.value)}
                            placeholder='e.g. "M.2 4.0 x4 (CPU)", "3.5 Disk 2"'
                        />
                    )}
                    {spaceId != null && (
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Position U (optional)" size="small" type="number" fullWidth
                                value={positionU}
                                onChange={(e) => setPositionU(e.target.value)}
                                helperText="Blank = in the space, not at a U"
                            />
                            <TextField
                                label="Height U" size="small" type="number" fullWidth
                                value={heightU}
                                onChange={(e) => setHeightU(e.target.value)}
                            />
                        </Box>
                    )}
                    {spaceId != null && component.currentMachineName && (
                        <Typography variant="caption" color="text.secondary">
                            Stays in {component.currentMachineName} — racking a part does not take
                            it out of the machine it is in.
                        </Typography>
                    )}
                    {spaceId == null && (
                        <TextField
                            label="Date (optional)" type="date" size="small"
                            value={movedAt}
                            onChange={(e) => setMovedAt(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            helperText="Leave empty for now; backdate for imports"
                        />
                    )}
                    <TextField
                        label="Reason (optional)" size="small"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Upgrade, swap, failure…"
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleMove} variant="contained" disabled={saving}>
                    {spaceId != null ? 'Place' : 'Move'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default LabComponentMoveDialog;
