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

import React, { useState, useEffect, useCallback } from "react";
import {
    Box,
    Snackbar,
    Alert,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { preloadCommonFonts } from '@junctionrelay/frameengine';

// Import sub-components
import FrameEngineListingSection from '../components/FrameEngine_ListingSection';

// Types
type ViewMode = 'gallery' | 'table';
type SortDirection = 'asc' | 'desc';

interface FrameLayoutListItem {
    id: string;
    isTemplate?: boolean;
    displayName: string;
    description?: string;
    layoutType: string;
    width?: number;
    height?: number;
    hasThumbnail?: boolean;
    thumbnailPath?: string;
    thumbnailGeneratedAt?: string;
}

// Storage keys
const STORAGE_KEY_FRAMEENGINE_COLUMNS = "frameengine_visible_columns";
const STORAGE_KEY_FRAMEENGINE_SORT = "frameengine_sort_state";
const STORAGE_KEY_FRAMEENGINE_VIEW_MODE = "junctionrelay_frameengine_view_mode";

// Default visible columns
const defaultVisibleColumns = ["name", "template", "type", "mode", "description", "dimensions", "thumbnail", "actions"];

// Minimal FrameEngine Embed Component - Just the listing, no buttons or management
const FrameEngineEmbed = () => {
    const { hasValidLicense } = useAuth();
    const [frameLayouts, setFrameLayouts] = useState<FrameLayoutListItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");

    // View mode and table management state
    const [viewMode, setViewMode] = useState<ViewMode>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_FRAMEENGINE_VIEW_MODE);
        return (stored as ViewMode) || 'gallery';
    });

    const [visibleCols, setVisibleCols] = useState<string[]>(() => {
        const stored = localStorage.getItem(STORAGE_KEY_FRAMEENGINE_COLUMNS);
        return stored ? JSON.parse(stored) : defaultVisibleColumns;
    });

    const [sortState, setSortState] = useState<{ orderBy: string, order: SortDirection }>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY_FRAMEENGINE_SORT);
            return stored ? JSON.parse(stored) : { orderBy: 'displayName', order: 'asc' };
        } catch (e) {
            return { orderBy: 'displayName', order: 'asc' };
        }
    });

    const navigate = useNavigate();

    // Preload common Google Fonts for FrameEngine2 on mount
    useEffect(() => {
        preloadCommonFonts();
    }, []);

    // Persist states
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_FRAMEENGINE_VIEW_MODE, viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_FRAMEENGINE_COLUMNS, JSON.stringify(visibleCols));
    }, [visibleCols]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_FRAMEENGINE_SORT, JSON.stringify(sortState));
    }, [sortState]);

    // Show snackbar with configurable severity
    const showSnackbar = useCallback((message: string, severity: "success" | "info" | "warning" | "error" = "success") => {
        setSnackMessage(message);
        setSnackbarSeverity(severity);
    }, []);

    const fetchFrameLayouts = useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/frameengine");
            if (!response.ok) {
                throw new Error("Failed to fetch frame layouts");
            }
            const data = await response.json();
            setFrameLayouts(data);
        } catch (err: any) {
            showSnackbar("Error fetching frame layouts", "error");
            console.error("Error fetching frame layouts:", err);
        } finally {
            setLoading(false);
        }
    }, [showSnackbar]);

    useEffect(() => {
        fetchFrameLayouts();
    }, [fetchFrameLayouts]);

    // Event handlers
    const handleDelete = async (e: React.MouseEvent, frameLayoutId: string) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this frame layout?")) return;
        try {
            const response = await fetch(`/api/frameengine/${frameLayoutId}`, { method: "DELETE" });
            if (!response.ok) throw new Error("Failed to delete frame layout");
            await fetchFrameLayouts();
            showSnackbar("Frame layout deleted successfully", "success");
        } catch (err: any) {
            showSnackbar("Error deleting frame layout", "error");
        }
    };

    const handleEdit = (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => {
        e.stopPropagation();
        navigate(`/configure-frame/${frameLayout.id}`);
    };

    const handleClone = async (e: React.MouseEvent, frameLayout: FrameLayoutListItem) => {
        e.stopPropagation();
        try {
            const originalId = parseInt(frameLayout.id, 10);
            const response = await fetch("/api/frameengine/clone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ originalId })
            });
            if (!response.ok) throw new Error("Failed to clone frame layout");
            await fetchFrameLayouts();
            showSnackbar("Frame layout cloned successfully", "success");
        } catch (err: any) {
            showSnackbar("Error cloning frame layout", "error");
        }
    };

    const handleViewModeChange = useCallback((mode: ViewMode) => {
        setViewMode(mode);
    }, []);

    const handleSortChange = useCallback((orderBy: string, order: SortDirection) => {
        setSortState({ orderBy, order });
    }, []);

    return (
        <Box sx={{ padding: 2, height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Listing Section only - no buttons or management UI */}
            <FrameEngineListingSection
                frameLayouts={frameLayouts}
                loading={loading}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                visibleColumns={visibleCols}
                onVisibleColumnsChange={setVisibleCols}
                sortState={sortState}
                onSortChange={handleSortChange}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onClone={handleClone}
                onShowSnackbar={showSnackbar}
                isMobile={false}
                hasProLicense={hasValidLicense}
            />

            {/* Snackbar for notifications */}
            <Snackbar
                open={Boolean(snackMessage)}
                autoHideDuration={6000}
                onClose={() => setSnackMessage(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackMessage(null)}
                    severity={snackbarSeverity}
                    sx={{ width: "100%" }}
                >
                    {snackMessage}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default FrameEngineEmbed;
