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

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Snackbar, Alert } from "@mui/material";
import { usePageTitle } from "../hooks/usePageTitle";
import { useAuth } from "../auth/AuthContext";
import { FrameEngine_ManageTab } from '@junctionrelay/frameengine';
import type { SnackbarSeverity, CloudAuthState } from '@junctionrelay/frameengine';

const FrameEngine = () => {
    usePageTitle('FrameEngine');
    const navigate = useNavigate();
    const { isAuthenticated, isLoading, hasValidLicense, user } = useAuth();

    // Plugin import prefs (default false, only show when explicitly true)
    const [enableImportElements, setEnableImportElements] = useState(false);
    const [enableImportShaders, setEnableImportShaders] = useState(false);

    useEffect(() => {
        const loadPluginSettings = async () => {
            try {
                for (const key of ['plugin_import_elements', 'plugin_import_shaders']) {
                    const res = await fetch(`/api/settings/${key}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (key === 'plugin_import_elements') setEnableImportElements(data.value === 'true');
                        if (key === 'plugin_import_shaders') setEnableImportShaders(data.value === 'true');
                    }
                }
            } catch {
                // Settings may not exist yet, defaults to false
            }
        };
        loadPluginSettings();
    }, []);

    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackSeverity, setSnackSeverity] = useState<SnackbarSeverity>("success");

    // Map Server's unified auth to CloudAuthState for the shared CloudTab
    const cloudAuth = useMemo<CloudAuthState>(() => ({
        isAuthenticated,
        loading: isLoading,
        hasValidLicense,
        userName: user?.username ?? null,
        profileImageUrl: null,
    }), [isAuthenticated, isLoading, hasValidLicense, user?.username]);

    const handleShowSnackbar = useCallback((message: string, severity: SnackbarSeverity = "success") => {
        setSnackMessage(message);
        setSnackSeverity(severity);
    }, []);

    const handleCloudLogin = useCallback(() => {
        navigate('/settings');
    }, [navigate]);

    const handleEditLayout = useCallback((id: string) => {
        navigate(`/configure-frame/${id}`);
    }, [navigate]);

    return (
        <>
            <FrameEngine_ManageTab
                header="FrameEngine Management"
                persistKey="frameengine_active_tab"
                onEditLayout={handleEditLayout}
                onShowSnackbar={handleShowSnackbar}
                hasProLicense={hasValidLicense}
                showCloudSnapshots={true}
                cloudAuth={cloudAuth}
                onCloudLogin={handleCloudLogin}
                cloudLoginLabel="Go to Settings"
                cloudLoginMessage="Connect to JunctionRelay Cloud in Settings to browse and subscribe to community-created layouts from FrameXchange."
                enableImportElements={enableImportElements}
                enableImportShaders={enableImportShaders}
                hideServerTab={true}
            />
            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={6000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackMessage(null)}
                    severity={snackSeverity}
                    sx={{ width: "100%" }}
                >
                    {snackMessage}
                </Alert>
            </Snackbar>
        </>
    );
};

export default FrameEngine;
