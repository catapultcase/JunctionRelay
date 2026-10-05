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

import { useState, useEffect, useMemo } from 'react';
import { CollectorMetadata, CollectorGroup } from '../types/CollectorMetadata';
import { errorMessage } from '../utils/errors';

export function useCollectorTypes() {
    const [collectorTypes, setCollectorTypes] = useState<CollectorMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const fetchTypes = async () => {
            try {
                const response = await fetch('/api/collectors/types');
                if (!response.ok) throw new Error('Failed to fetch collector types');
                const data: CollectorMetadata[] = await response.json();
                if (!cancelled) {
                    setCollectorTypes(data);
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

    const collectorTypesByName = useMemo(() => {
        const map = new Map<string, CollectorMetadata>();
        for (const ct of collectorTypes) {
            map.set(ct.collectorName, ct);
        }
        return map;
    }, [collectorTypes]);

    const collectorGroups = useMemo((): CollectorGroup[] => {
        const groupMap = new Map<string, CollectorMetadata[]>();
        for (const ct of collectorTypes) {
            const existing = groupMap.get(ct.category) || [];
            existing.push(ct);
            groupMap.set(ct.category, existing);
        }
        return Array.from(groupMap.entries()).map(([name, types]) => ({ name, types }));
    }, [collectorTypes]);

    return { collectorTypes, collectorTypesByName, collectorGroups, loading, error };
}
