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

// The component vocabulary, served from Lab_ComponentTypes instead of hardcoded constants.
//
// Replaces COMPONENT_TYPES, SPEC_FIELDS, TYPE_SECTION_COLUMNS and TYPE_SECTION_TITLES. Those
// four lists had to be edited together to add a category, which is why `Rack` ended up
// half-added: filed on components, absent from the list, and therefore rendered as 'Other'.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SectionColumn, LabComponentFull } from './Lab_Inventory_Helpers';

export type TypeFieldKind = 'text' | 'number' | 'select' | 'boolean';

export interface ComponentTypeField {
    key: string;
    label: string;
    kind: TypeFieldKind;
    unit?: string;
    options?: string[];
    multiline?: boolean;
    showInTable?: boolean;
    tableLabel?: string;      // shorter header; falls back to label
    align?: 'left' | 'right';
    sortOrder: number;
}

export interface ComponentType {
    id: number;
    name: string;
    label?: string;
    sortOrder: number;
    status: string;           // active | retired
    icon?: string;
    notes?: string;
    fieldsJson?: string;
    componentCount: number;
}

// ⚠️ THE COLUMNS THAT ARE LOGIC, NOT DATA. Everything else about a type is editable from the
// UI, but these compute rather than read: CPU sums P and E cores into one figure, and Other
// reads the component's own Spec column rather than SpecJson. Expressing them as data would
// mean inventing an expression language; they stay here, keyed by "Type.field".
const CUSTOM_GETTERS: Record<string, SectionColumn['get']> = {
    'CPU.cores': (_c, s) => (s.cores != null ? Number(s.cores) + Number(s.eCores || 0) : null),
    'Other.spec': (c: LabComponentFull) => c.spec,
};

export const parseFields = (t: ComponentType): ComponentTypeField[] => {
    if (!t.fieldsJson) return [];
    try {
        const parsed: ComponentTypeField[] = JSON.parse(t.fieldsJson);
        return Array.isArray(parsed)
            ? [...parsed].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            : [];
    } catch {
        return [];   // a malformed row must not take the page down
    }
};

export const sectionColumnsFor = (t: ComponentType): SectionColumn[] =>
    parseFields(t)
        .filter(f => f.showInTable)
        .map((f): SectionColumn => {
            const custom = CUSTOM_GETTERS[`${t.name}.${f.key}`];
            return {
                key: f.key,
                label: f.tableLabel || f.label,
                align: f.align,
                unit: f.unit ? ` ${f.unit}` : undefined,
                multiline: f.multiline,
                get: custom ?? ((_c, spec) => spec[f.key]),
            };
        });

// Module-level cache: Inventory, the Add modal and Spaces all need this, and none of them
// should each fire their own request on mount.
let cache: ComponentType[] | null = null;
let inflight: Promise<ComponentType[]> | null = null;
const subscribers = new Set<(t: ComponentType[]) => void>();

const load = (force = false): Promise<ComponentType[]> => {
    if (cache && !force) return Promise.resolve(cache);
    if (inflight && !force) return inflight;
    inflight = fetch('/api/lab/component-types')
        .then(r => (r.ok ? r.json() : []))
        .then((rows: ComponentType[]) => {
            cache = rows;
            subscribers.forEach(fn => fn(rows));
            return rows;
        })
        .catch(() => [])
        .finally(() => { inflight = null; });
    return inflight;
};

// Groups items by their `type` in the order the vocabulary defines, with any type the table
// has never heard of appended alphabetically rather than swallowed. Shared by every picker
// so they all section parts the same way the Inventory page does.
export const groupByType = <T extends { type?: string }>(
    items: T[], typeNames: string[],
): Array<readonly [string, T[]]> => {
    const byType = new Map<string, T[]>();
    for (const item of items) {
        const t = item.type || 'Other';
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t)!.push(item);
    }
    const known = typeNames.filter(t => byType.has(t));
    const extra = [...byType.keys()].filter(t => !typeNames.includes(t)).sort();
    return [...known, ...extra].map(t => [t, byType.get(t)!] as const);
};

export const useComponentTypes = () => {
    const [types, setTypes] = useState<ComponentType[]>(cache ?? []);
    const [loading, setLoading] = useState(cache === null);

    useEffect(() => {
        subscribers.add(setTypes);
        load().then(() => setLoading(false));
        return () => { subscribers.delete(setTypes); };
    }, []);

    const reload = useCallback(() => load(true), []);

    // ⛔ MEMOISED, AND THIS IS NOT AN OPTIMISATION. Rebuilt on every render, each would return
    // a new array/function identity every time, and any consumer with one in a useEffect
    // dependency array would re-run that effect on EVERY render - the Add Component modal would
    // be impossible to type in: keystroke -> state change -> re-render -> new typeNames
    // identity -> effect fires -> setForm(emptyForm) wipes the field.
    const active = useMemo(() => types.filter(t => t.status !== 'retired'), [types]);
    const typeNames = useMemo(() => active.map(t => t.name), [active]);

    const titleFor = useCallback(
        (name: string) => types.find(t => t.name === name)?.label || name, [types]);
    const fieldsFor = useCallback((name: string) => {
        const t = types.find(x => x.name === name);
        return t ? parseFields(t) : [];
    }, [types]);
    const columnsFor = useCallback((name: string) => {
        const t = types.find(x => x.name === name);
        return t ? sectionColumnsFor(t) : [];
    }, [types]);

    return {
        types,
        loading,
        reload,
        // Ordered names, retired types excluded - retiring one keeps its components rendering
        // but takes it out of the pickers.
        typeNames,
        titleFor,
        fieldsFor,
        columnsFor,
    };
};
