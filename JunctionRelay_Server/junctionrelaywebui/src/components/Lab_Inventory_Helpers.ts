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

export interface LabComponentFull {
    id: number;
    type: string;
    name?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    nickname?: string | null;
    serialNumber?: string | null;
    sku?: string | null;
    spec?: string | null;
    specJson?: string | null;
    status: string;
    currentMachineId?: number | null;
    currentMachineName?: string | null;
    spaceName?: string | null;          // its own rack placement
    spacePositionU?: number | null;
    machineSpaceName?: string | null;   // the rack its machine sits in
    attachmentCount: number;
    // Integrated parts: the part this one came inside of. acquiredAt / vendor /
    // warrantyYears then come from that parent (inheritsPurchase); price never does.
    parentComponentId?: number | null;
    parentComponentName?: string | null;
    inheritsPurchase?: boolean;
    // Where the invoice actually lives: the root of the integration chain.
    invoiceSourceComponentId?: number | null;
    invoiceSourceName?: string | null;
    inheritedAttachmentCount?: number;
    releaseDate?: string | null;    // "YYYY" or "YYYY-MM-DD"
    releaseYear?: number | null;    // legacy fallback
    msrp?: number | null;
    listPrice?: number | null;
    listPriceDate?: string | null;
    listPriceNotes?: string | null;
    purchasePrice?: number | null;
    acquiredAt?: string | null;
    source?: string | null;
    vendor?: string | null;
    warrantyYears?: number | null;
    notes?: string | null;
    createdAt: string;
    updatedAt: string;
    // Latest market observation from the append-only ledger (populated server-side)
    lastObservedValue?: number | null;
    lastObservedAt?: string | null;
}

// PCPartPicker-style type list. Order here is the section order on the Inventory page.
export const COMPONENT_TYPES = ['CPU', 'GPU', 'MOBO', 'RAM', 'Storage', 'PSU', 'Cooler', 'Fan', 'Monitor', 'NIC', 'Case', 'Printer', 'Other'];

export const COMPONENT_SOURCES = ['New', 'Internal', 'Shucked', 'Used'];

// ---------------------------------------------------------------------------
// SpecJson — the typed, sortable/filterable spec fields, stored as JSON in
// Lab_Components.SpecJson. One shape per component type. The human-readable
// `spec` display string is composed from these fields on save.
// ---------------------------------------------------------------------------

export interface SpecFieldDef {
    key: string;
    label: string;
    kind: 'number' | 'text' | 'boolean' | 'select';
    options?: string[];
    unit?: string;           // display suffix, e.g. "GB", "MT/s"
    multiline?: boolean;     // one entry per line (e.g. network interfaces)
}

export const SPEC_FIELDS: Record<string, SpecFieldDef[]> = {
    CPU: [
        { key: 'cores', label: 'Cores (P)', kind: 'number' },
        { key: 'eCores', label: 'E-Cores', kind: 'number' },
        { key: 'threads', label: 'Threads', kind: 'number' },
        { key: 'platform', label: 'Platform', kind: 'text' },
        { key: 'integratedWith', label: 'Integrated With', kind: 'text' },
    ],
    GPU: [
        { key: 'vramGb', label: 'VRAM', kind: 'number', unit: 'GB' },
        { key: 'integratedWith', label: 'Integrated With', kind: 'text' },
    ],
    MOBO: [
        { key: 'form', label: 'Form Factor', kind: 'select', options: ['ITX', 'mATX', 'ATX', 'E-ATX', 'STX', 'PICO'] },
        { key: 'platform', label: 'Platform', kind: 'text' },
        { key: 'ddrGen', label: 'DDR Gen', kind: 'select', options: ['DDR3', 'DDR4', 'DDR5', 'DDR4 SODIMM', 'DDR5 SODIMM'] },
        { key: 'network', label: 'Network (one interface per line)', kind: 'text', multiline: true },
        { key: 'ecc', label: 'ECC Support', kind: 'boolean' },
        { key: 'integratedParts', label: 'Integrated Parts', kind: 'text' },
    ],
    RAM: [
        { key: 'sizeGb', label: 'Size', kind: 'number', unit: 'GB' },
        { key: 'ddrGen', label: 'DDR Gen', kind: 'select', options: ['DDR3', 'DDR3L', 'DDR4', 'DDR5'] },
        { key: 'speedMts', label: 'Speed', kind: 'number', unit: 'MT/s' },
        { key: 'cas', label: 'CAS', kind: 'number' },
        { key: 'timings', label: 'Timings', kind: 'text' },
        { key: 'ecc', label: 'ECC', kind: 'boolean' },
        { key: 'formFactor', label: 'Form', kind: 'select', options: ['DIMM', 'SODIMM', 'RDIMM'] },
    ],
    Storage: [
        { key: 'sizeTb', label: 'Size', kind: 'number', unit: 'TB' },
        { key: 'interface', label: 'Interface', kind: 'text' },
        { key: 'rpm', label: 'RPM', kind: 'number' },
        { key: 'zfsConfig', label: 'ZFS / Array', kind: 'text' },
    ],
    PSU: [
        { key: 'watts', label: 'Watts', kind: 'number', unit: 'W' },
        { key: 'formFactor', label: 'Form Factor', kind: 'select', options: ['ATX', 'SFX', 'SFX-L', 'TFX', 'GaN', 'Integrated'] },
    ],
    Cooler: [
        { key: 'coolerType', label: 'Type', kind: 'select', options: ['Air', 'AIO 120', 'AIO 240', 'AIO 280', 'AIO 360'] },
        { key: 'fanMm', label: 'Fan Size', kind: 'number', unit: 'mm' },
    ],
    Fan: [
        { key: 'sizeMm', label: 'Size', kind: 'number', unit: 'mm' },
        { key: 'rpm', label: 'Max RPM', kind: 'number' },
        { key: 'connector', label: 'Connector', kind: 'select', options: ['3-pin', '4-pin PWM', 'USB', 'Proprietary'] },
        { key: 'rgb', label: 'RGB', kind: 'boolean' },
    ],
    Monitor: [
        { key: 'sizeInch', label: 'Size', kind: 'number', unit: '"' },
        { key: 'resolution', label: 'Resolution', kind: 'text' },
        { key: 'refreshHz', label: 'Refresh', kind: 'number', unit: 'Hz' },
        { key: 'panel', label: 'Panel', kind: 'text' },
    ],
    NIC: [
        { key: 'speed', label: 'Speed', kind: 'text' },
    ],
    Case: [
        { key: 'form', label: 'Form Factor', kind: 'text' },
    ],
    Printer: [
        { key: 'printerType', label: 'Type', kind: 'select', options: ['FDM', 'Resin', 'Laser', 'Inkjet'] },
        { key: 'buildVolume', label: 'Build Volume', kind: 'text' },
    ],
    Other: [],
};

export type ComponentSpec = Record<string, string | number | boolean | null | undefined>;

export const parseSpecJson = (c: Pick<LabComponentFull, 'specJson'>): ComponentSpec => {
    if (!c.specJson) return {};
    try { return JSON.parse(c.specJson) || {}; } catch { return {}; }
};

// Compose the human-readable spec summary from typed fields (used on save).
export const composeSpecString = (type: string, spec: ComponentSpec): string => {
    const parts: string[] = [];
    switch (type) {
        case 'CPU': {
            const cores = spec.cores != null ? `${spec.cores}${spec.eCores ? `P+${spec.eCores}E` : 'c'}` : null;
            if (cores && spec.threads != null) parts.push(`${cores}/${spec.threads}t`);
            else if (cores) parts.push(cores);
            if (spec.platform) parts.push(String(spec.platform));
            break;
        }
        case 'GPU':
            if (spec.vramGb != null) parts.push(`${spec.vramGb} GB VRAM`);
            break;
        case 'MOBO':
            if (spec.form) parts.push(String(spec.form));
            if (spec.platform) parts.push(String(spec.platform));
            if (spec.ddrGen) parts.push(String(spec.ddrGen));
            if (spec.network) parts.push(String(spec.network).split('\n').filter(Boolean).join(', '));
            break;
        case 'RAM': {
            if (spec.sizeGb != null) parts.push(`${spec.sizeGb} GB`);
            const gen = [spec.ddrGen, spec.speedMts ? `-${spec.speedMts}` : ''].filter(Boolean).join('');
            if (gen) parts.push(gen);
            if (spec.timings) parts.push(String(spec.timings));
            else if (spec.cas != null) parts.push(`CL${spec.cas}`);
            if (spec.ecc) parts.push('ECC');
            if (spec.formFactor && spec.formFactor !== 'DIMM') parts.push(String(spec.formFactor));
            break;
        }
        case 'Storage':
            if (spec.sizeTb != null) parts.push(`${spec.sizeTb} TB`);
            if (spec.interface) parts.push(String(spec.interface));
            if (spec.rpm) parts.push(`${spec.rpm}rpm`);
            if (spec.zfsConfig) parts.push(String(spec.zfsConfig));
            break;
        case 'PSU':
            if (spec.watts != null) parts.push(`${spec.watts} W`);
            if (spec.formFactor) parts.push(String(spec.formFactor));
            break;
        case 'Cooler':
            if (spec.coolerType) parts.push(String(spec.coolerType));
            if (spec.fanMm) parts.push(`${spec.fanMm}mm`);
            break;
        case 'Fan':
            if (spec.sizeMm) parts.push(`${spec.sizeMm}mm`);
            if (spec.rpm) parts.push(`${spec.rpm} RPM`);
            if (spec.connector) parts.push(String(spec.connector));
            if (spec.rgb) parts.push('RGB');
            break;
        case 'Printer':
            if (spec.printerType) parts.push(String(spec.printerType));
            if (spec.buildVolume) parts.push(String(spec.buildVolume));
            break;
        case 'Monitor':
            if (spec.sizeInch != null) parts.push(`${spec.sizeInch}"`);
            if (spec.resolution) parts.push(String(spec.resolution));
            if (spec.refreshHz) parts.push(`${spec.refreshHz}Hz`);
            if (spec.panel) parts.push(String(spec.panel));
            break;
        case 'NIC':
            if (spec.speed) parts.push(String(spec.speed));
            break;
        default:
            break;
    }
    return parts.join(', ');
};

// ---------------------------------------------------------------------------
// Per-type section tables (PCPartPicker-style sections on the Inventory page).
// Each section column either reads a component field or a SpecJson field.
// ---------------------------------------------------------------------------

export interface SectionColumn {
    key: string;
    label: string;
    align?: 'left' | 'right';
    // Sort/display value. Numbers sort numerically, strings lexically.
    get: (c: LabComponentFull, spec: ComponentSpec) => string | number | boolean | null | undefined;
    unit?: string;
    multiline?: boolean;     // render each line as its own bulleted row
}

const specCol = (key: string, label: string, opts: Partial<SectionColumn> = {}): SectionColumn => ({
    key, label,
    get: (_c, spec) => spec[key],
    ...opts,
});

export const TYPE_SECTION_COLUMNS: Record<string, SectionColumn[]> = {
    CPU: [
        specCol('cores', 'Cores', { align: 'right', get: (_c, s) => s.cores != null ? Number(s.cores) + Number(s.eCores || 0) : null }),
        specCol('threads', 'Threads', { align: 'right' }),
        specCol('platform', 'Platform'),
    ],
    GPU: [
        specCol('vramGb', 'VRAM', { align: 'right', unit: ' GB' }),
    ],
    MOBO: [
        specCol('form', 'Form'),
        specCol('platform', 'Platform'),
        specCol('ddrGen', 'DDR'),
        specCol('network', 'Network', { multiline: true, get: (_c, s) => s.network ?? null }),
        specCol('ecc', 'ECC'),
    ],
    RAM: [
        specCol('sizeGb', 'Size', { align: 'right', unit: ' GB' }),
        specCol('ddrGen', 'DDR'),
        specCol('speedMts', 'Speed', { align: 'right', unit: ' MT/s' }),
        specCol('cas', 'CAS', { align: 'right' }),
        specCol('ecc', 'ECC'),
        specCol('formFactor', 'Form'),
    ],
    Storage: [
        specCol('sizeTb', 'Size', { align: 'right', unit: ' TB' }),
        specCol('interface', 'Interface'),
        specCol('rpm', 'RPM', { align: 'right' }),
        specCol('zfsConfig', 'ZFS / Array'),
    ],
    PSU: [
        specCol('watts', 'Watts', { align: 'right', unit: ' W' }),
        specCol('formFactor', 'Form'),
    ],
    Cooler: [
        specCol('coolerType', 'Type'),
        specCol('fanMm', 'Fan', { align: 'right', unit: ' mm' }),
    ],
    Fan: [
        specCol('sizeMm', 'Size', { align: 'right', unit: ' mm' }),
        specCol('rpm', 'Max RPM', { align: 'right' }),
        specCol('connector', 'Connector'),
        specCol('rgb', 'RGB'),
    ],
    Monitor: [
        specCol('sizeInch', 'Size', { align: 'right', unit: '"' }),
        specCol('resolution', 'Resolution'),
        specCol('refreshHz', 'Refresh', { align: 'right', unit: ' Hz' }),
        specCol('panel', 'Panel'),
    ],
    NIC: [
        specCol('speed', 'Speed'),
    ],
    Case: [
        specCol('form', 'Form'),
    ],
    Printer: [
        specCol('printerType', 'Type'),
        specCol('buildVolume', 'Build Volume'),
    ],
    Other: [
        { key: 'spec', label: 'Spec', get: (c) => c.spec },
    ],
};

export const TYPE_SECTION_TITLES: Record<string, string> = {
    CPU: 'CPUs', GPU: 'GPUs', MOBO: 'Motherboards', RAM: 'Memory', Storage: 'Storage',
    PSU: 'Power Supplies', Cooler: 'CPU Coolers', Fan: 'Fans', Monitor: 'Monitors',
    NIC: 'Network Adapters', Case: 'Cases', Printer: 'Printers', Other: 'Other',
};

// ---------------------------------------------------------------------------
// Cross-type ("All Components") view — unchanged legacy column set
// ---------------------------------------------------------------------------

export const INVENTORY_COLUMNS: ColumnDefinition<string>[] = [
    { field: 'type', label: 'Type', align: 'left', sortable: true },
    { field: 'name', label: 'Component', align: 'left', sortable: true },
    { field: 'spec', label: 'Spec', align: 'left', sortable: true },
    { field: 'status', label: 'Status', align: 'left', sortable: true },
    { field: 'currentMachineName', label: 'Location', align: 'left', sortable: true },
    { field: 'releaseYear', label: 'Released', align: 'right', sortable: true, defaultHidden: true },
    { field: 'msrp', label: 'MSRP', align: 'right', sortable: true, defaultHidden: true },
    { field: 'purchasePrice', label: 'Paid', align: 'right', sortable: true, defaultHidden: true },
    { field: 'source', label: 'Condition', align: 'left', sortable: true, defaultHidden: true },
    { field: 'serialNumber', label: 'Serial', align: 'left', sortable: true, defaultHidden: true },
    { field: 'actions', label: 'Actions', align: 'right', pinned: 'end', alwaysVisible: true, width: 140 },
];

// ---------------------------------------------------------------------------
// Status vocabulary — mirrors the server's (Service_Database_Manager_Lab_Components).
// 'active' and 'spare' restate where a part is; the retired set says it has left the
// fleet, and why. Retired parts live in the Graveyard and are excluded from the
// in-service views and totals.
// ---------------------------------------------------------------------------

export const RETIRED_STATUSES = ['sold', 'dead', 'damaged', 'lost', 'disposed'] as const;

export const isRetiredStatus = (status?: string | null): boolean =>
    RETIRED_STATUSES.includes((status || '').toLowerCase() as typeof RETIRED_STATUSES[number]);

// What the edit form offers. 'active' is absent on purpose: a part becomes active by
// being installed, so offering it as a choice would promise something a move undoes.
export const SETTABLE_STATUSES: { value: string; label: string; help: string }[] = [
    { value: 'spare', label: 'Spare', help: 'Working, on the shelf' },
    { value: 'sold', label: 'Sold', help: 'Sold on — no longer owned' },
    { value: 'dead', label: 'Dead', help: 'Failed and kept or binned' },
    { value: 'damaged', label: 'Damaged', help: 'Physically damaged' },
    { value: 'lost', label: 'Lost', help: 'Unaccounted for' },
    { value: 'disposed', label: 'Disposed', help: 'Thrown away or recycled' },
];

export const getComponentStatusInfo = (status: string): { label: string; color: 'success' | 'info' | 'warning' | 'error' | 'default' } => {
    switch ((status || '').toLowerCase()) {
        case 'active': return { label: 'Active', color: 'success' };
        case 'spare': return { label: 'Spare', color: 'info' };
        case 'sold': return { label: 'Sold', color: 'warning' };
        case 'dead': return { label: 'Dead', color: 'error' };
        case 'damaged': return { label: 'Damaged', color: 'error' };
        case 'lost': return { label: 'Lost', color: 'default' };
        case 'disposed': return { label: 'Disposed', color: 'default' };
        default: return { label: status || 'Unknown', color: 'default' };
    }
};

export const componentDisplayName = (c: LabComponentFull) => {
    // ⛔ PRECEDENCE, and every one of these steps is load-bearing. A name you typed wins,
    // because you typed it. Otherwise the maker and model compose one, which is how almost
    // every part in the inventory is named. Falling back to the nickname matters for no-brand
    // parts: a patch panel entered with only a nickname was labelled "component 215" - it
    // could not be found by its own name in the picker and drew as a blank block in a rack.
    // ⚠️ The nickname stays in parentheses rather than replacing the name. Nicknames are not
    // unique - three identical drives can share one - so leading with one would make them
    // indistinguishable in exactly the lists you pick from.
    const base = c.name
        || [c.manufacturer, c.model].filter(Boolean).join(' ')
        || c.nickname || c.type;
    return c.nickname && c.nickname !== base ? `${base} ("${c.nickname}")` : base;
};

// ---------------------------------------------------------------------------
// Date entry — US format in the forms, ISO in storage.
//
// Release dates are deliberately allowed to be a bare YEAR (often all that is
// known about a part's launch), which is why the field is typed text rather than a
// date picker: a picker cannot express "2024". Storage stays ISO so it sorts and
// compares; only what the user reads and types is MM/DD/YYYY.
// ---------------------------------------------------------------------------

/** "2024-11-07" -> "11/07/2024"; a bare "2024" passes through unchanged. */
export const toUsDate = (stored?: string | null): string => {
    if (!stored) return '';
    const iso = stored.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
    return stored;
};

/** "11/07/2024" -> "2024-11-07"; a bare "2024" stays a year; anything else is
 *  handed back untouched rather than mangled into a wrong date. */
export const fromUsDate = (typed: string): string => {
    const t = typed.trim();
    if (!t) return '';
    const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    if (/^\d{4}$/.test(t)) return t;
    return t;
};

// Release as "YYYY" or "YYYY-MM-DD", falling back to the legacy year field
export const componentReleased = (c: LabComponentFull): string | null =>
    c.releaseDate || (c.releaseYear != null ? String(c.releaseYear) : null);

// The two questions the price toggle answers, both anchored on what was PAID:
//   'purchase' — how good a purchase was this the day I bought it?
//                (basis = the invoice's list price at purchase)
//   'today'    — how good is it vs what it costs today, new?
//                (basis = the latest market observation from the ledger)
// MSRP is neither: launch list is its own static column — but when no list price at
// purchase was ever recorded, launch MSRP is the only "what it should have cost"
// figure there is, so the purchase basis falls back to it rather than showing a dash.
// The fallback is always marked, because a discount off launch MSRP and a discount
// off the list price on the day are different claims: the first ignores every price
// move between launch and purchase.
export type PriceBasis = 'purchase' | 'today';

export const basisPrice = (c: LabComponentFull, basis: PriceBasis): number | null | undefined =>
    basis === 'today' ? c.lastObservedValue : (c.listPrice ?? c.msrp);

/** True when the purchase basis is standing in launch MSRP for a missing list price. */
export const basisIsMsrpFallback = (c: LabComponentFull, basis: PriceBasis): boolean =>
    basis === 'purchase' && c.listPrice == null && c.msrp != null;

// The date the basis figure was captured, "YYYY-MM-DD" (or null when unknown).
// Both dates trim to day precision — listPriceDate may arrive as a bare date or a
// full timestamp depending on how it was written; the column only ever shows a date.
export const basisDate = (c: LabComponentFull, basis: PriceBasis): string | null =>
    basis === 'today' ? (c.lastObservedAt?.slice(0, 10) ?? null) : (c.listPriceDate?.slice(0, 10) ?? null);

// Integrated silicon (CPU/GPU baked into a parent board) carries no pricing of
// its own - the parent carries it. Price columns render "N/A" for these rather
// than "-" so a deliberate non-value is distinguishable from missing data.
// A linked parent is the real answer; the free-text spec note is the legacy one, kept
// so rows that predate the link still read as integrated (and still show N/A for price).
export const isIntegratedChild = (c: Pick<LabComponentFull, 'parentComponentId' | 'specJson'>): boolean =>
    Boolean(c.parentComponentId) || !!parseSpecJson(c).integratedWith;

export const COMPONENT_TYPE_EMOJI: Record<string, string> = {
    CPU: '🧠',
    GPU: '🎮',
    MOBO: '🧩',
    RAM: '📏',
    Memory: '📏',
    Storage: '💾',
    PSU: '🔌',
    Cooler: '❄️',
    Fan: '🌀',
    Monitor: '🖥️',
    NIC: '🌐',
    Case: '📦',
    Printer: '🖨️',
    Other: '⚙️',
};
