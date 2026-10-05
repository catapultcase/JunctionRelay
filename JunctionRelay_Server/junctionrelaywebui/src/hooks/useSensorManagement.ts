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

import { useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { errorMessage } from '../utils/errors';
import type { Sensor } from '../types/entities';

// TYPE SAFETY: Sensor interface

interface LastFetchStats {
    totalFetched: number;
    totalStored: number;
    newSensors: number;
    lostSensors: number;
    fetchSuccessful: boolean;
    lastFetchTime: Date | null;
}

interface AddSensorsProgress {
    added: number;
    total: number;
    skipped: number;
}

/**
 * Custom hook for managing collector sensor operations
 *
 * Handles sensor fetch, add, delete, and bulk operations.
 * Extracted from ConfigureCollector per architecture guidelines (component size limits).
 *
 * @param collectorId - The ID of the collector
 * @param isLocked - Whether the collector is locked
 * @param showSnackbar - Callback to show snackbar messages
 * @param setLastFetchStats - Callback to update fetch statistics in parent
 */
export function useSensorManagement(
    collectorId: string | undefined,
    isLocked: boolean,
    showSnackbar: (message: string, severity: "success" | "error" | "info" | "warning") => void,
    setLastFetchStats: (stats: LastFetchStats | ((prev: LastFetchStats) => LastFetchStats)) => void,
    setShowUnlockDialog: (show: boolean) => void
) {
    const [storedSensors, setStoredSensors] = useState<Sensor[]>([]);
    const [fetchedSensors, setFetchedSensors] = useState<Sensor[]>([]);
    const [lostSensors, setLostSensors] = useState<Sensor[]>([]);
    const [fetchingSensors, setFetchingSensors] = useState(false);
    const [sensorFetchError, setSensorFetchError] = useState<string | null>(null);

    // Bulk sensor addition progress state
    const [addingSensors, setAddingSensors] = useState(false);
    const [addSensorsProgress, setAddSensorsProgress] = useState<AddSensorsProgress>({ added: 0, total: 0, skipped: 0 });
    const [addSensorsComplete, setAddSensorsComplete] = useState(false);
    const [addSensorsError, setAddSensorsError] = useState<string | null>(null);

    const fetchStoredSensors = useCallback(async () => {
        if (!collectorId) return;

        try {
            const rsp = await fetch(`/api/collectors/${collectorId}/sensors`);
            if (!rsp.ok) {
                if (rsp.status === 500) {
                    setStoredSensors([]);
                    return;
                }
                throw new Error();
            }
            const data = await rsp.json();

            // TYPE SAFETY: Validate array data
            if (!Array.isArray(data.storedSensors)) {
                throw new Error('Invalid sensor data received from API');
            }

            const transformedSensors: Sensor[] = data.storedSensors.map((sensor: Sensor) => ({
                ...sensor,
                deviceName: "Collector",
                isSelected: true,
                sensorOrder: sensor.sensorOrder || 0,
            }));

            setStoredSensors(transformedSensors);

            // Update stored sensor count in stats
            setLastFetchStats(prev => ({
                ...prev,
                totalStored: transformedSensors.length
            }));
        } catch {
            setStoredSensors([]);
        }
    }, [collectorId, setLastFetchStats]);

    const fetchDeltaSensors = useCallback(async () => {
        if (isLocked) {
            showSnackbar("Please unlock the collector first", "warning");
            setShowUnlockDialog(true);
            return;
        }

        setFetchingSensors(true);
        setSensorFetchError(null);

        try {
            const rsp = await fetch(`/api/collectors/${collectorId}/sensors/delta`);
            if (!rsp.ok) throw new Error(`HTTP ${rsp.status}: ${rsp.statusText}`);

            const response = await rsp.json();
            const deltaSensors = response.deltaSensors || response.newSensors || [];
            const lostSensorsData = response.lostSensors || [];
            const totalFetched = response.totalFetched || 0;
            const totalStored = response.totalStored || 0;
            const totalLost = response.totalLost || 0;
            const fetchSuccessful = response.fetchSuccessful || false;
            const errorMessage = response.errorMessage;

            // Update fetch statistics
            setLastFetchStats({
                totalFetched,
                totalStored,
                newSensors: deltaSensors.length,
                lostSensors: totalLost,
                fetchSuccessful,
                lastFetchTime: new Date()
            });

            if (!fetchSuccessful || errorMessage) {
                setSensorFetchError(errorMessage || "Failed to fetch sensors from the collector. Please check the collector configuration, network connectivity, and ensure the target service is accessible.");
                showSnackbar("Error fetching sensors from collector", "error");
                setFetchedSensors([]);
                setLostSensors([]);
                return;
            }

            if (totalFetched === 0) {
                setSensorFetchError("No sensors were returned from the collector. This could indicate a connection issue, incorrect configuration, or the collector service may not be running properly.");
                showSnackbar("No sensors found - please check collector configuration", "warning");
                setFetchedSensors([]);
                setLostSensors([]);
                return;
            }

            // Transform the delta sensors for display
            // New sensors have no id yet; a negative index keys them until they are stored.
            const transformedNewSensors: Sensor[] = deltaSensors.map((sensor: Sensor, index: number) => ({
                ...sensor,
                id: sensor.id || -(index + 1),
                deviceName: "Collector (New)",
                isSelected: false,
                sensorOrder: 0,
            }));

            // Transform the lost sensors for display
            const transformedLostSensors: Sensor[] = lostSensorsData.map((sensor: Sensor) => ({
                ...sensor,
                deviceName: "Collector (Lost)",
                isSelected: false,
                sensorOrder: sensor.sensorOrder || 0,
            }));

            await fetchStoredSensors();

            // OPTIMIZATION: Batch all state updates together to prevent cascading re-renders
            ReactDOM.unstable_batchedUpdates(() => {
                setFetchedSensors(transformedNewSensors);
                setLostSensors(transformedLostSensors);
                setSensorFetchError(null);
            });

            // Enhanced notification messages
            if (deltaSensors.length === 0 && lostSensorsData.length === 0) {
                showSnackbar("No new or lost sensors detected", "info");
            } else {
                const messages = [];
                if (deltaSensors.length > 0) messages.push(`${deltaSensors.length} new sensors`);
                if (lostSensorsData.length > 0) messages.push(`${lostSensorsData.length} lost sensors`);
                showSnackbar(`Found: ${messages.join(', ')}`, "success");
            }

            return { newCount: transformedNewSensors.length, lostCount: transformedLostSensors.length };
        } catch (err) {
            console.error("Error fetching delta sensors:", err);
            setSensorFetchError(`Failed to fetch sensors from the collector: ${errorMessage(err)}`);
            showSnackbar("Error fetching new sensors", "error");
            setFetchedSensors([]);
            setLostSensors([]);

            // Update stats to reflect the failure
            setLastFetchStats(prev => ({
                ...prev,
                fetchSuccessful: false,
                lastFetchTime: new Date()
            }));
        } finally {
            setFetchingSensors(false);
        }
    }, [collectorId, isLocked, showSnackbar, setShowUnlockDialog, setLastFetchStats, fetchStoredSensors]);

    const handleAddSensor = useCallback(async (sensorId: number | string) => {
        try {
            const sensor = fetchedSensors.find((s) => s.id === sensorId);
            if (!sensor) throw new Error("Sensor not found");

            const payload = {
                name: sensor.name,
                externalId: sensor.externalId || sensor.sensorTag,
                sensorType: sensor.sensorType,
                value: sensor.value,
                unit: sensor.unit || "",
                decimalPlaces: sensor.decimalPlaces || 0,
                componentName: sensor.componentName || "",
                lastUpdated: sensor.lastUpdated || new Date().toISOString(),
                collectorId: Number(collectorId),
                sensorTag: sensor.sensorTag || sensor.externalId || "",
                deviceName: sensor.deviceName || "Collector",
                category: sensor.componentName || "Sensor",
                mqttTopic: sensor.mqttTopic || null,
                mqttQoS: sensor.mqttQoS || null,
                customAttribute1: sensor.customAttribute1 || null,
                customAttribute2: sensor.customAttribute2 || null,
                customAttribute3: sensor.customAttribute3 || null,
                customAttribute4: sensor.customAttribute4 || null,
                customAttribute5: sensor.customAttribute5 || null,
                customAttribute6: sensor.customAttribute6 || null,
                customAttribute7: sensor.customAttribute7 || null,
                customAttribute8: sensor.customAttribute8 || null,
                customAttribute9: sensor.customAttribute9 || null,
                customAttribute10: sensor.customAttribute10 || null
            };

            const rsp = await fetch(`/api/sensors/collectors/${collectorId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!rsp.ok) {
                let errorMsg = `HTTP Error: ${rsp.status} ${rsp.statusText}`;
                try {
                    const errorData = await rsp.text();
                    console.error("Server error details:", errorData);
                    errorMsg += ` - ${errorData}`;
                } catch (e) {
                    // Ignore text parsing error
                }
                throw new Error(errorMsg);
            }

            setFetchedSensors(fetchedSensors.filter((s) => s.id !== sensorId));
            await fetchStoredSensors();
            setSensorFetchError(null);

            // Update fetch stats
            setLastFetchStats(prev => ({
                ...prev,
                newSensors: prev.newSensors - 1
            }));

            showSnackbar("Sensor added successfully.", "success");
        } catch (error) {
            console.error("Error adding sensor:", error);
            showSnackbar(`Error adding sensor: ${error instanceof Error ? error.message : 'Unknown error'}`, "error");
        }
    }, [collectorId, fetchedSensors, fetchStoredSensors, showSnackbar, setLastFetchStats]);

    const handleAddAllSensors = useCallback(async () => {
        if (fetchedSensors.length === 0) {
            showSnackbar("No new sensors to add", "info");
            return;
        }

        // Initialize progress modal
        setAddingSensors(true);
        setAddSensorsProgress({ added: 0, total: fetchedSensors.length, skipped: 0 });
        setAddSensorsComplete(false);
        setAddSensorsError(null);

        try {
            // Prepare sensor payloads
            const sensorPayloads = fetchedSensors.map((sensor) => ({
                name: sensor.name,
                externalId: sensor.externalId || sensor.sensorTag,
                sensorType: sensor.sensorType,
                value: sensor.value,
                unit: sensor.unit || "",
                decimalPlaces: sensor.decimalPlaces || 0,
                componentName: sensor.componentName || "",
                lastUpdated: sensor.lastUpdated || new Date().toISOString(),
                collectorId: Number(collectorId),
                sensorTag: sensor.sensorTag || sensor.externalId || "",
                deviceName: sensor.deviceName || "Collector",
                category: sensor.componentName || "Sensor",
                mqttTopic: sensor.mqttTopic || null,
                mqttQoS: sensor.mqttQoS || null,
                customAttribute1: sensor.customAttribute1 || null,
                customAttribute2: sensor.customAttribute2 || null,
                customAttribute3: sensor.customAttribute3 || null,
                customAttribute4: sensor.customAttribute4 || null,
                customAttribute5: sensor.customAttribute5 || null,
                customAttribute6: sensor.customAttribute6 || null,
                customAttribute7: sensor.customAttribute7 || null,
                customAttribute8: sensor.customAttribute8 || null,
                customAttribute9: sensor.customAttribute9 || null,
                customAttribute10: sensor.customAttribute10 || null
            }));

            // Call bulk insert endpoint
            const response = await fetch(`/api/sensors/collectors/${collectorId}/bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(sensorPayloads),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to add sensors: ${errorText}`);
            }

            const result = await response.json();
            const addedCount = result.successCount || result.sensors?.length || 0;
            const skippedCount = result.skippedCount || 0;

            // Update progress
            setAddSensorsProgress({ added: addedCount, total: fetchedSensors.length, skipped: skippedCount });
            setAddSensorsComplete(true);

            // Refresh data
            setFetchedSensors([]);
            await fetchStoredSensors();
            setSensorFetchError(null);

            // Update fetch stats
            setLastFetchStats(prev => ({
                ...prev,
                newSensors: 0
            }));

            // Show appropriate snackbar message
            if (skippedCount > 0) {
                showSnackbar(`Added ${addedCount} sensors, skipped ${skippedCount}`, "warning");
            } else {
                showSnackbar(`Successfully added all ${addedCount} sensors`, "success");
            }

            return { added: addedCount, skipped: skippedCount };
        } catch (error) {
            console.error("Error in bulk add operation:", error);
            setAddSensorsError(error instanceof Error ? error.message : "An error occurred while adding sensors");
            setAddSensorsComplete(true);
            showSnackbar("An error occurred while adding sensors", "error");
        }
    }, [collectorId, fetchedSensors, fetchStoredSensors, showSnackbar, setLastFetchStats]);

    const handleDeleteSensor = useCallback(async (sensorId: number) => {
        try {
            const rsp = await fetch(`/api/sensors/${sensorId}`, { method: "DELETE" });
            if (!rsp.ok) throw new Error();

            setStoredSensors(storedSensors.filter((s) => s.id !== sensorId));
            showSnackbar("Sensor deleted.", "success");
        } catch {
            showSnackbar("Error deleting sensor.", "error");
        }
    }, [storedSensors, showSnackbar]);

    const handleRemoveLostSensor = useCallback(async (sensorId: number) => {
        if (window.confirm("Are you sure you want to remove this lost sensor from the database? This action cannot be undone.")) {
            try {
                const rsp = await fetch(`/api/sensors/${sensorId}`, { method: "DELETE" });
                if (!rsp.ok) throw new Error();

                setLostSensors(lostSensors.filter((s) => s.id !== sensorId));
                await fetchStoredSensors();
                showSnackbar("Lost sensor removed from database.", "success");
            } catch {
                showSnackbar("Error removing lost sensor.", "error");
            }
        }
    }, [lostSensors, fetchStoredSensors, showSnackbar]);

    const handleRemoveAllLostSensors = useCallback(async () => {
        if (lostSensors.length === 0) return;

        if (window.confirm(`Are you sure you want to remove all ${lostSensors.length} lost sensors from the database? This action cannot be undone.`)) {
            try {
                let removed = 0;
                for (const sensor of lostSensors) {
                    const rsp = await fetch(`/api/sensors/${sensor.id}`, { method: "DELETE" });
                    if (rsp.ok) removed++;
                }

                setLostSensors([]);
                await fetchStoredSensors();
                showSnackbar(`Removed ${removed} lost sensors from database.`, "success");
            } catch {
                showSnackbar("Error removing lost sensors.", "error");
            }
        }
    }, [lostSensors, fetchStoredSensors, showSnackbar]);

    const handleCloseProgressModal = useCallback(() => {
        setAddingSensors(false);
        setAddSensorsProgress({ added: 0, total: 0, skipped: 0 });
        setAddSensorsComplete(false);
        setAddSensorsError(null);
    }, []);

    return {
        storedSensors,
        fetchedSensors,
        lostSensors,
        fetchingSensors,
        sensorFetchError,
        addingSensors,
        addSensorsProgress,
        addSensorsComplete,
        addSensorsError,
        setSensorFetchError,
        fetchStoredSensors,
        fetchDeltaSensors,
        handleAddSensor,
        handleAddAllSensors,
        handleDeleteSensor,
        handleRemoveLostSensor,
        handleRemoveAllLostSensors,
        handleCloseProgressModal
    };
}
