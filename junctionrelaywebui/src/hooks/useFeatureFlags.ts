/*
 * This file is part of Junction Relay.
 *
 * Copyright (C) 2024–present Jonathan Mills, CatapultCase
 *
 * Junction Relay is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Junction Relay is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Junction Relay. If not, see <https://www.gnu.org/licenses/>.
 */

import { useEffect, useState } from "react";

export interface FeatureFlags {
    host_charts?: boolean;
    [key: string]: boolean | undefined;
}

export const useFeatureFlags = () => {
    const [flags, setFlags] = useState<FeatureFlags | null>(null);

    useEffect(() => {
        const fetchFlags = async () => {
            try {
                const res = await fetch("/api/settings/flags");
                const data = await res.json();
                setFlags(data);
            } catch {
                setFlags({});
            }
        };

        fetchFlags();
    }, []);

    return flags;
};