/*
 * This file is part of JunctionRelay.
 *
 * Copyright (C) 2024-present Jonathan Mills, CatapultCase
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

import { useState, useEffect, useMemo } from 'react';
import { ProtocolMetadata, ProtocolGroup } from '../types/ProtocolMetadata';
import { errorMessage } from '../utils/errors';

export function useProtocolTypes() {
    const [protocolTypes, setProtocolTypes] = useState<ProtocolMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const fetchTypes = async () => {
            try {
                const response = await fetch('/api/protocols/types');
                if (!response.ok) throw new Error('Failed to fetch protocol types');
                const data: ProtocolMetadata[] = await response.json();
                if (!cancelled) {
                    setProtocolTypes(data);
                    setError(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(errorMessage(err));
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchTypes();
        return () => { cancelled = true; };
    }, []);

    const protocolTypesByName = useMemo(() => {
        const map = new Map<string, ProtocolMetadata>();
        for (const pt of protocolTypes) {
            map.set(pt.protocolName, pt);
        }
        return map;
    }, [protocolTypes]);

    const protocolGroups = useMemo((): ProtocolGroup[] => {
        const groupMap = new Map<string, ProtocolMetadata[]>();
        for (const pt of protocolTypes) {
            const existing = groupMap.get(pt.category) || [];
            existing.push(pt);
            groupMap.set(pt.category, existing);
        }
        return Array.from(groupMap.entries()).map(([name, types]) => ({ name, types }));
    }, [protocolTypes]);

    return { protocolTypes, protocolTypesByName, protocolGroups, loading, error };
}
