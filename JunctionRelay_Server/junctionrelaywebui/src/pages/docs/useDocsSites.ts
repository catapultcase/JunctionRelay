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

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from '../../utils/errors';

export interface DocsSite {
    id: string;
    name: string;
    path: string;
    discovered: boolean;
    url: string;
}

export interface DocsSitesResponse {
    enabled: boolean;
    rootsVar: string;
    roots: string[];
    sites: DocsSite[];
}

/** The configured documentation sites. Shared by the navbar tab row and the pages. */
export const useDocsSites = () => {
    const [data, setData] = useState<DocsSitesResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/docs/sites");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setData(await res.json());
        } catch (e) {
            setError(errorMessage(e) ?? "Could not reach the server.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { reload(); }, [reload]);

    return { data, loading, error, reload };
};
