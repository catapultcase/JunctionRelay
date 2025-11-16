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

import { useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';

// TYPE SAFETY: Collector interface
export interface Collector {
    id: number;
    name: string;
    collectorType: string;
    url?: string;
    accessToken?: string;
    externalAccessToken?: boolean;
    serviceId?: number;
    pollRate: number;
    sendRate?: number;
    description?: string;
    lastFetchTime?: string;
    lastFetchTotalSensors?: number;
    lastFetchNewSensors?: number;
    lastFetchLostSensors?: number;
    lastFetchSuccessful?: boolean;
    lastFetchErrorMessage?: string;
    lastTested?: string;
    testFrequency?: number;
    isRunning?: boolean;
    autoStart?: boolean;
}

// TYPE SAFETY: Type guard for runtime validation
function isCollector(data: unknown): data is Collector {
    return (
        typeof data === 'object' &&
        data !== null &&
        'id' in data &&
        'name' in data &&
        'collectorType' in data &&
        typeof (data as any).name === 'string' &&
        typeof (data as any).collectorType === 'string'
    );
}

interface LastFetchStats {
    totalFetched: number;
    totalStored: number;
    newSensors: number;
    lostSensors: number;
    fetchSuccessful: boolean;
    lastFetchTime: Date | null;
}

/**
 * Custom hook for managing collector state and operations
 *
 * Handles collector CRUD operations, edit mode, encryption settings, and fetch statistics.
 * Extracted from ConfigureCollector per architecture guidelines (component size limits).
 *
 * @param collectorId - The ID of the collector to manage
 * @param showSnackbar - Callback to show snackbar messages
 * @param checkUnlockStatus - Callback to check lock status after save
 */
export function useCollectorManagement(
    collectorId: string | undefined,
    showSnackbar: (message: string, severity: "success" | "error" | "info" | "warning") => void,
    checkUnlockStatus: () => Promise<void>
) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [collector, setCollector] = useState<Collector | null>(null);
    const [originalCollector, setOriginalCollector] = useState<Collector | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [accessTokenChanged, setAccessTokenChanged] = useState(false);
    const [encryptionPassword, setEncryptionPassword] = useState<string>("");
    const [originalEncryptionMethod, setOriginalEncryptionMethod] = useState<boolean>(false);
    const [lastFetchStats, setLastFetchStats] = useState<LastFetchStats>({
        totalFetched: 0,
        totalStored: 0,
        newSensors: 0,
        lostSensors: 0,
        fetchSuccessful: false,
        lastFetchTime: null
    });

    const fetchCollector = useCallback(async () => {
        if (!collectorId) return;

        try {
            const rsp = await fetch(`/api/collectors/${collectorId}`);
            if (!rsp.ok) throw new Error('Failed to fetch collector');
            const data = await rsp.json();

            // TYPE SAFETY: Validate response data with type guard
            if (!isCollector(data)) {
                throw new Error('Invalid collector data received from API');
            }

            setCollector(data);
            setOriginalCollector({ ...data });
            setOriginalEncryptionMethod(data.externalAccessToken || false);

            // Use persisted lastFetch stats
            if (data.lastFetchTime) {
                const totalFetched = data.lastFetchTotalSensors ?? 0;
                const newSensors = data.lastFetchNewSensors ?? 0;
                setLastFetchStats({
                    totalFetched,
                    totalStored: totalFetched - newSensors,
                    newSensors,
                    lostSensors: data.lastFetchLostSensors ?? 0,
                    fetchSuccessful: data.lastFetchSuccessful ?? false,
                    lastFetchTime: new Date(data.lastFetchTime)
                });
            }
        } catch (error) {
            console.error("Error fetching collector:", error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [collectorId]);

    const updateCollectorField = useCallback((field: string, value: any) => {
        if (field === 'accessToken') {
            setAccessTokenChanged(true);
        }
        setCollector((prev) => prev ? { ...prev, [field]: value } as Collector : null);
    }, []);

    const hasChanges = useMemo(() => {
        if (!originalCollector || !collector) return false;

        const encryptionMethodChanged = (collector.externalAccessToken || false) !== originalEncryptionMethod;

        const fieldsChanged = Object.keys(collector).some(key => {
            if (key === 'accessToken' && !accessTokenChanged) {
                return false;
            }
            return (collector as any)[key] !== (originalCollector as any)[key];
        });

        return fieldsChanged || encryptionMethodChanged;
    }, [collector, originalCollector, accessTokenChanged, originalEncryptionMethod]);

    const accessTokenDisplay = useMemo(() => {
        const isExisting = originalCollector?.accessToken;
        if (isExisting && !accessTokenChanged) {
            return '••••••••••••••••';
        }
        return collector?.accessToken || '';
    }, [originalCollector?.accessToken, accessTokenChanged, collector?.accessToken]);

    const accessTokenHelperText = useMemo(() => {
        const isExisting = originalCollector?.accessToken;
        if (isExisting && !accessTokenChanged) {
            return "Encrypted access token exists. Enter new token to change it.";
        }
        return "Access token (will be encrypted when saved)";
    }, [originalCollector?.accessToken, accessTokenChanged]);

    const handleSaveCollector = useCallback(async () => {
        if (!collector || !collectorId) return;

        setSaving(true);
        try {
            const payload: any = { ...collector };

            if (!accessTokenChanged && originalCollector?.accessToken) {
                delete payload.accessToken;
            }

            if (collector.externalAccessToken && accessTokenChanged && encryptionPassword.trim()) {
                payload.encryptionPassword = encryptionPassword;
            }

            if (!collector.externalAccessToken && originalEncryptionMethod) {
                payload.externalAccessToken = false;
                delete payload.encryptionPassword;
            }

            const response = await fetch(`/api/collectors/${collectorId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to save collector: ${errorText}`);
            }

            await fetchCollector();
            await checkUnlockStatus();

            ReactDOM.unstable_batchedUpdates(() => {
                setEditMode(false);
                setAccessTokenChanged(false);
                setEncryptionPassword("");
            });

            showSnackbar("Collector updated successfully", "success");
        } catch (err: any) {
            showSnackbar(`Error saving collector: ${err.message}`, "error");
            console.error("Error saving collector:", err);
        } finally {
            setSaving(false);
        }
    }, [collector, collectorId, accessTokenChanged, originalCollector, encryptionPassword, originalEncryptionMethod, fetchCollector, checkUnlockStatus, showSnackbar]);

    const handleCancelEdit = useCallback(() => {
        if (originalCollector) {
            setCollector({ ...originalCollector });
        }
        setAccessTokenChanged(false);
        setEncryptionPassword("");
        setEditMode(false);
    }, [originalCollector]);

    return {
        loading,
        saving,
        collector,
        originalCollector,
        editMode,
        accessTokenChanged,
        encryptionPassword,
        originalEncryptionMethod,
        lastFetchStats,
        hasChanges,
        accessTokenDisplay,
        accessTokenHelperText,
        setEditMode,
        setAccessTokenChanged,
        setEncryptionPassword,
        setLastFetchStats,
        fetchCollector,
        updateCollectorField,
        handleSaveCollector,
        handleCancelEdit
    };
}
