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
import { useEffect, useState, useCallback } from "react";

export interface FeatureFlags {
    host_charts?: boolean;
    device_actions_alignment?: string;
    junction_actions_alignment?: string;
    use_mobile_navigation?: string;
    show_current_version?: string;
    [key: string]: boolean | string | undefined;
}

export const useFeatureFlags = () => {
    const [flags, setFlags] = useState<FeatureFlags | null>(null);

    const fetchFlags = useCallback(async () => {
        try {
            const res = await fetch("/api/settings/flags");
            const data = await res.json();
            setFlags(data);
        } catch {
            setFlags({});
        }
    }, []);

    useEffect(() => {
        // Initial fetch
        fetchFlags();

        // Listen for flag changes
        const handleFlagsChanged = () => {
            fetchFlags();
        };

        const handleSettingsChanged = () => {
            fetchFlags();
        };

        window.addEventListener('flags-changed', handleFlagsChanged);
        window.addEventListener('settings-changed', handleSettingsChanged);

        return () => {
            window.removeEventListener('flags-changed', handleFlagsChanged);
            window.removeEventListener('settings-changed', handleSettingsChanged);
        };
    }, [fetchFlags]);

    return flags;
};