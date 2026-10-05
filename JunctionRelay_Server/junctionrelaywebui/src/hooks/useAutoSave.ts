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

import { useCallback, useRef, useState, useEffect } from "react";

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutoSaveOptions<T> {
    /** Delay in milliseconds for debounced saves (default: 2000) */
    debounceDelay?: number;
    /** Duration to show 'saved' status in milliseconds (default: 2000) */
    savedStatusDuration?: number;
    /** Duration to show 'error' status in milliseconds (default: 3000) */
    errorStatusDuration?: number;
    /** Function to call on successful save */
    onSuccess?: (savedData: T) => void;
    /** Function to call on save error */
    onError?: (error: unknown) => void;
}

export interface AutoSaveState<T> {
    /** Current auto-save status */
    status: AutoSaveStatus;
    /** Whether there are unsaved changes */
    hasUnsavedChanges: boolean;
    /** Function to trigger save with data */
    save: (data: T, options?: { immediate?: boolean }) => Promise<void>;
    /** Function to mark data as having changes */
    markChanged: () => void;
    /** Function to mark data as saved/clean */
    markSaved: () => void;
    /** Function to reset the auto-save state */
    reset: () => void;
    /** Function to update the original data reference (for external sync) */
    updateOriginalData: (data: T) => void;
}

/**
 * Universal auto-save hook - always saves, with smart debouncing
 * 
 * @param endpoint - API endpoint to save to (e.g., '/api/devices/123')
 * @param originalData - Original data to compare against for change detection
 * @param options - Configuration options
 * @returns AutoSaveState object with status and control functions
 */
export const useAutoSave = <T extends object>(
    endpoint: string,
    originalData: T | null,
    options: AutoSaveOptions<T> = {}
): AutoSaveState<T> => {
    const {
        debounceDelay = 500,
        savedStatusDuration = 2000,
        errorStatusDuration = 3000,
        onSuccess,
        onError,
    } = options;

    // State
    const [status, setStatus] = useState<AutoSaveStatus>('idle');
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

    // Refs for managing timers and preventing stale closures
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
    const statusTimerRef = useRef<NodeJS.Timeout | null>(null);
    const originalDataRef = useRef(originalData);
    const currentSaveRef = useRef<Promise<void> | null>(null);
    const lastSavedDataRef = useRef<T | null>(null);
    const isInitializedRef = useRef<boolean>(false); // Track if hook is initialized
    const pendingSaveRef = useRef<{ data: T, options: { immediate?: boolean } } | null>(null); // Queue saves before init

    // Update original data ref when it changes from external source
    useEffect(() => {
        if (originalData && JSON.stringify(originalData) !== JSON.stringify(originalDataRef.current)) {
            originalDataRef.current = originalData;
            lastSavedDataRef.current = originalData;
            setHasUnsavedChanges(false);

            // Mark as initialized after first data load
            const wasInitialized = isInitializedRef.current;
            if (!wasInitialized) {
                isInitializedRef.current = true;
            }

        }
    }, [originalData]);

    // Separate effect to handle pending saves after initialization
    useEffect(() => {
        if (isInitializedRef.current && pendingSaveRef.current) {
            const { data } = pendingSaveRef.current;
            pendingSaveRef.current = null;


            // Use a timeout to avoid calling save during render
            setTimeout(() => {
                // Create a simple inline save to avoid dependency issues
                const processPendingSave = async () => {
                    try {

                        // Simple change check using the cleanDataForComparison function
                        const cleanNewData = cleanDataForComparison(data);
                        const cleanSavedData = cleanDataForComparison(lastSavedDataRef.current);

                        if (!lastSavedDataRef.current ||
                            JSON.stringify(cleanNewData) !== JSON.stringify(cleanSavedData)) {

                            // Handle SSH credential obfuscation
                            if (cleanNewData.SshPassword === '••••••••' || cleanNewData.SshPassword === '') {
                                delete cleanNewData.SshPassword;
                            }
                            if (cleanNewData.SshPrivateKey === '••••••••' || cleanNewData.SshPrivateKey === '') {
                                delete cleanNewData.SshPrivateKey;
                            }

                            setStatus('saving');

                            const response = await fetch(endpoint, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(cleanNewData)
                            });

                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
                            }

                            lastSavedDataRef.current = data;
                            originalDataRef.current = data;
                            setHasUnsavedChanges(false);
                            setStatusWithTimer('saved', savedStatusDuration);

                            if (onSuccess) {
                                onSuccess(data);
                            }
                        }
                    } catch (error) {
                        console.error('[useAutoSave] Queued save failed:', error);
                        setStatusWithTimer('error', errorStatusDuration);
                        if (onError) {
                            onError(error);
                        }
                    }
                };

                processPendingSave();
            }, 100);
        }
    }); // Remove dependencies to avoid circular dependency issues

    // Cleanup timers on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
            if (statusTimerRef.current) {
                clearTimeout(statusTimerRef.current);
            }
        };
    }, []);

    // Set status with auto-clear timer
    const setStatusWithTimer = useCallback((newStatus: AutoSaveStatus, duration?: number) => {
        setStatus(newStatus);

        if (statusTimerRef.current) {
            clearTimeout(statusTimerRef.current);
        }

        if (duration && newStatus !== 'idle') {
            statusTimerRef.current = setTimeout(() => {
                setStatus('idle');
            }, duration);
        }
    }, []);

    // The fields compared to decide whether a save is needed: everything except UI-only fields, and except a
    // lowercase heartbeat field whose PascalCase twin is present (the API reads the PascalCase one).
    const cleanDataForComparison = useCallback((data: T | null): Record<string, unknown> => {
        if (!data) return {};
        const keys = new Set(Object.keys(data));
        const uiOnly = new Set(['sensors', 'hasSshPassword', 'hasSshPrivateKey']);
        return Object.fromEntries(Object.entries(data).filter(([key]) =>
            !uiOnly.has(key) &&
            !(key.startsWith('heartbeat') && keys.has(key.charAt(0).toUpperCase() + key.slice(1)))));
    }, []);

    // Check if data has actually changed
    const hasDataChanged = useCallback((newData: T) => {
        // Don't trigger saves before initialization
        if (!isInitializedRef.current) {
            return false;
        }

        if (!lastSavedDataRef.current) {
            return true;
        }

        // Clean both datasets for comparison
        const cleanNewData = cleanDataForComparison(newData);
        const cleanSavedData = cleanDataForComparison(lastSavedDataRef.current);

        const newDataString = JSON.stringify(cleanNewData);
        const savedDataString = JSON.stringify(cleanSavedData);

        return newDataString !== savedDataString;
    }, [cleanDataForComparison]);

    // Perform the actual save operation
    const performSave = useCallback(async (data: T): Promise<void> => {
        try {

            // Check if data actually changed before making request
            if (!hasDataChanged(data)) {
                setHasUnsavedChanges(false);
                setStatusWithTimer('saved', savedStatusDuration);
                return;
            }

            // Clean the data before sending
            const cleanData = cleanDataForComparison(data);

            // Handle SSH credential obfuscation - don't send if unchanged
            if (cleanData.SshPassword === '••••••••' || cleanData.SshPassword === '') {
                delete cleanData.SshPassword;
            }
            if (cleanData.SshPrivateKey === '••••••••' || cleanData.SshPrivateKey === '') {
                delete cleanData.SshPrivateKey;
            }


            const response = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(cleanData)
            });


            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            // Update tracking data after successful save
            lastSavedDataRef.current = data;
            originalDataRef.current = data;
            setHasUnsavedChanges(false);
            setStatusWithTimer('saved', savedStatusDuration);


            if (onSuccess) {
                onSuccess(data);
            }

        } catch (error) {
            setStatusWithTimer('error', errorStatusDuration);

            if (onError) {
                onError(error);
            }

            throw error;
        }
    }, [endpoint, onSuccess, onError, setStatusWithTimer, savedStatusDuration, errorStatusDuration, hasDataChanged]);

    // Main save function with debouncing logic
    const save = useCallback(async (data: T, saveOptions: { immediate?: boolean } = {}): Promise<void> => {
        const { immediate = false } = saveOptions;


        if (!data) {
            return;
        }

        // Don't save if not initialized (queue it instead)
        if (!isInitializedRef.current) {
            // Store the most recent save request
            pendingSaveRef.current = { data, options: saveOptions };
            return;
        }

        // Check if data has actually changed
        if (!hasDataChanged(data)) {
            return;
        }


        // Mark as having changes when save is called with actual changes
        setHasUnsavedChanges(true);

        // Clear any existing debounce timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }

        // Cancel any existing save if this is immediate
        if (immediate && currentSaveRef.current) {
            // Let the existing save complete, but queue this one
        }

        if (immediate) {
            // Immediate save (for toggles, dropdowns, etc.)
            setStatus('saving');
            currentSaveRef.current = performSave(data);
            try {
                await currentSaveRef.current;
            } finally {
                currentSaveRef.current = null;
            }
        } else {
            // Debounced save (for text inputs, etc.)
            setStatus('saving');

            debounceTimerRef.current = setTimeout(async () => {
                currentSaveRef.current = performSave(data);
                try {
                    await currentSaveRef.current;
                } finally {
                    currentSaveRef.current = null;
                }
            }, debounceDelay);
        }
    }, [performSave, debounceDelay, hasDataChanged]);

    // Mark as having changes (for manual save scenarios)
    const markChanged = useCallback(() => {
        setHasUnsavedChanges(true);
    }, []);

    // Mark as saved/clean
    const markSaved = useCallback(() => {
        setHasUnsavedChanges(false);
        setStatus('idle');

        // Clear any pending saves
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }

        if (statusTimerRef.current) {
            clearTimeout(statusTimerRef.current);
            statusTimerRef.current = null;
        }
    }, []);

    // Reset the auto-save state
    const reset = useCallback(() => {
        setStatus('idle');
        setHasUnsavedChanges(false);

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }

        if (statusTimerRef.current) {
            clearTimeout(statusTimerRef.current);
            statusTimerRef.current = null;
        }

        currentSaveRef.current = null;
        lastSavedDataRef.current = null;
        isInitializedRef.current = false; // Reset initialization flag
        pendingSaveRef.current = null; // Clear any pending saves
    }, []);

    // Update original data reference (for external synchronization)
    const updateOriginalData = useCallback((data: T) => {
        originalDataRef.current = data;
        lastSavedDataRef.current = data;
        setHasUnsavedChanges(false);
    }, []);

    return {
        status,
        hasUnsavedChanges,
        save,
        markChanged,
        markSaved,
        reset,
        updateOriginalData
    };
};

/**
 * Higher-order component hook that combines change detection with auto-save
 * Useful for forms where you want automatic change detection
 */
export const useAutoSaveWithChangeDetection = <T extends object>(
    endpoint: string,
    currentData: T,
    originalData: T,
    excludeFields: string[] = [],
    options: AutoSaveOptions<T> = {}
): AutoSaveState<T> & { checkForChanges: () => void } => {
    const autoSave = useAutoSave(endpoint, originalData, options);

    // Check for changes by comparing current data with original
    const checkForChanges = useCallback(() => {
        if (!originalData || !currentData) return;

        // Create comparison objects excluding specified fields
        const createComparisonObject = (data: T) =>
            Object.fromEntries(Object.entries(data).filter(([key]) => !excludeFields.includes(key)));

        const currentFiltered = createComparisonObject(currentData);
        const originalFiltered = createComparisonObject(originalData);

        const hasChanges = JSON.stringify(currentFiltered) !== JSON.stringify(originalFiltered);

        if (hasChanges !== autoSave.hasUnsavedChanges) {
            if (hasChanges) {
                autoSave.markChanged();
            } else {
                autoSave.markSaved();
            }
        }
    }, [currentData, originalData, excludeFields, autoSave]);

    return {
        ...autoSave,
        checkForChanges
    };
};