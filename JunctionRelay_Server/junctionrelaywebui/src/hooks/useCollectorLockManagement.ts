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

/**
 * Custom hook for managing collector lock/unlock functionality
 *
 * Handles encryption password-based locking for collectors with external access tokens.
 * Extracted from ConfigureCollector per architecture guidelines (component size limits).
 *
 * @param collectorId - The ID of the collector
 * @param showSnackbar - Callback to show snackbar messages
 * @param fetchStoredSensors - Callback to refresh stored sensors after unlock
 */
export function useCollectorLockManagement(
    collectorId: string | undefined,
    showSnackbar: (message: string, severity: "success" | "error" | "info" | "warning") => void,
    fetchStoredSensors: () => Promise<void>
) {
    const [isLocked, setIsLocked] = useState(false);
    const [showUnlockDialog, setShowUnlockDialog] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState("");
    const [unlocking, setUnlocking] = useState(false);

    const checkUnlockStatus = useCallback(async () => {
        if (!collectorId) return;

        try {
            const rsp = await fetch(`/api/collectors/${collectorId}/unlock-status`);
            if (rsp.ok) {
                const data = await rsp.json();
                setIsLocked(data.isLocked);
            }
        } catch (err) {
            console.error("Error checking unlock status:", err);
        }
    }, [collectorId]);

    const handleUnlockCollector = useCallback(async () => {
        if (!unlockPassword.trim()) {
            showSnackbar("Please enter the encryption password", "error");
            return;
        }

        setUnlocking(true);
        try {
            const response = await fetch(`/api/collectors/${collectorId}/unlock`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: unlockPassword }),
            });

            let responseData;
            try {
                responseData = await response.json();
            } catch (parseError) {
                throw new Error("Invalid response from server");
            }

            if (response.status === 200 && response.ok) {
                // OPTIMIZATION: Batch state updates to prevent multiple re-renders
                ReactDOM.unstable_batchedUpdates(() => {
                    setIsLocked(false);
                    setShowUnlockDialog(false);
                    setUnlockPassword("");
                });

                showSnackbar("Collector unlocked - running test...", "success");
                await fetchStoredSensors();
            } else {
                const errorMessage = responseData?.status || "Invalid password or error occurred";
                showSnackbar(errorMessage, "error");
            }
        } catch (err) {
            showSnackbar("Error communicating with server", "error");
        } finally {
            setUnlocking(false);
        }
        // NOTE: fetchStoredSensors excluded from dependencies due to declaration order
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collectorId, unlockPassword, showSnackbar]);

    const handleLockCollector = useCallback(async () => {
        try {
            const response = await fetch(`/api/collectors/${collectorId}/lock`, {
                method: "POST",
            });

            if (response.ok) {
                setIsLocked(true);
                showSnackbar("Collector locked", "info");
            } else {
                showSnackbar("Error locking collector", "error");
            }
        } catch (err) {
            showSnackbar("Error locking collector", "error");
            console.error("Error locking collector:", err);
        }
    }, [collectorId, showSnackbar]);

    return {
        isLocked,
        showUnlockDialog,
        unlockPassword,
        unlocking,
        setShowUnlockDialog,
        setUnlockPassword,
        checkUnlockStatus,
        handleUnlockCollector,
        handleLockCollector
    };
}
