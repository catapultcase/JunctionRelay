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

import { type ColumnDefinition } from '@junctionrelay/styles';
import { type LabComponentFull, COMPONENT_TYPE_EMOJI } from './Lab_Inventory_Helpers';

export interface LabMachine {
    id: number;
    name: string;
    hostname?: string | null;
    kind?: string | null;
    role?: string | null;
    status: string;
    os?: string | null;
    ipAddress?: string | null;
    location?: string | null;
    alwaysOn: boolean;
    linkedDeviceId?: number | null;
    notes?: string | null;
    componentCount: number;
    installedComponents?: LabComponentFull[];
    createdAt: string;
    updatedAt: string;
}

// Component chips for the machine card: EVERY installed part gets a chip, whatever its
// type. CHIP_TYPE_ORDER only sets the display order - it must never be used to filter,
// or a part whose type is not listed disappears from the card while still counting
// toward the component badge. Unlisted types sort last, alphabetically by type.
// Duplicates collapse to one chip with a multiplier ("\ud83d\udcbe P3 4TB \u00d73").
const CHIP_TYPE_ORDER = ['CPU', 'GPU', 'MOBO', 'Memory', 'RAM', 'Storage', 'PSU', 'NIC', 'Cooler', 'Monitor', 'Case', 'Other'];

const chipTypeRank = (type: string): number => {
    const i = CHIP_TYPE_ORDER.indexOf(type);
    return i === -1 ? CHIP_TYPE_ORDER.length : i;
};

export const getMajorComponentChips = (machine: LabMachine): string[] => {
    const components = machine.installedComponents ?? [];
    const entries: { key: string, label: string, count: number }[] = [];

    const ordered = [...components].sort((a, b) =>
        chipTypeRank(a.type) - chipTypeRank(b.type) || (a.type || '').localeCompare(b.type || ''));

    for (const c of ordered) {
        const emoji = COMPONENT_TYPE_EMOJI[c.type] || '\u2699\ufe0f';
        const label = c.model || c.type || 'Component';
        const key = `${emoji} ${label}`;
        const existing = entries.find(e => e.key === key);
        if (existing) existing.count += 1;
        else entries.push({ key, label: `${emoji} ${label}`, count: 1 });
    }

    return entries.map(e => e.count > 1 ? `${e.label} \u00d7${e.count}` : e.label);
};

export const MACHINE_COLUMNS: ColumnDefinition<string>[] = [
    { field: 'name', label: 'Machine Name', align: 'left', sortable: true },
    { field: 'role', label: 'Role', align: 'left', sortable: true },
    { field: 'status', label: 'Status', align: 'left', sortable: true },
    { field: 'os', label: 'OS', align: 'left', sortable: true },
    { field: 'ipAddress', label: 'IP Address', align: 'left', sortable: true },
    { field: 'location', label: 'Location', align: 'left', sortable: true, defaultHidden: true },
    { field: 'updatedAt', label: 'Updated', align: 'left', sortable: true, defaultHidden: true },
    { field: 'componentCount', label: 'Components', align: 'right', sortable: true, width: 70 },
    { field: 'actions', label: 'Actions', align: 'right', pinned: 'end', alwaysVisible: true, width: 120 },
];

export const getMachineStatusInfo = (status: string): { label: string; color: 'success' | 'info' | 'warning' | 'default' } => {
    switch ((status || '').toLowerCase()) {
        case 'active': return { label: 'Active', color: 'success' };
        case 'incoming': return { label: 'Incoming', color: 'info' };
        case 'retiring': return { label: 'Retiring', color: 'warning' };
        case 'retired': return { label: 'Retired', color: 'default' };
        default: return { label: status || 'Unknown', color: 'default' };
    }
};

export const MACHINE_STATUS_OPTIONS = ['active', 'incoming', 'retiring', 'retired'];

export const MACHINE_KINDS = ['Desktop', 'Laptop', 'Server', 'NAS', 'SBC', 'Mini PC', 'Console', 'Appliance', 'Test Bench', 'Other'];

const KIND_EMOJI: Record<string, string> = {
    Desktop: '🖥️',
    Laptop: '💻',
    Server: '🗄️',
    NAS: '🗃️',
    SBC: '📟',
    'Mini PC': '📦',
    Console: '🎮',
    Appliance: '📠',
    'Test Bench': '🛠️',
    Other: '⚙️',
};

export const machineEmoji = (machine?: Pick<LabMachine, 'kind'> | null): string =>
    (machine?.kind && KIND_EMOJI[machine.kind]) || '🖥️';
