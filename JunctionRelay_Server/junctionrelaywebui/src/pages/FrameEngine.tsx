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
    Button,
    Typography,
    Box,
    Snackbar,
    Alert,
    Modal,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
    CircularProgress,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import AddIcon from '@mui/icons-material/Add';
import UploadIcon from '@mui/icons-material/Upload';
import { useTheme, useMediaQuery } from "@mui/material";

// Import sub-components
import FrameEngineManagementSection from '../components/FrameEngine_ManagementSection';
import FrameEngineListingSection from '../components/FrameEngine_ListingSection';
import SetupInstructions_FrameEngine from '../components/SetupInstructions_FrameEngine';

// Types
type ViewMode = 'gallery' | 'table' | 'standard' | 'mini';
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
const defaultVisibleColumns = ["name", "template", "type", "description", "dimensions", "thumbnail", "actions"];

// Frequency options for auto-testing (if needed in future)
const frequencyOptions = [
    { value: 1, label: '1 hour' },
    { value: 6, label: '6 hours' },
    { value: 12, label: '12 hours' },
    { value: 18, label: '18 hours' },
    { value: 24, label: '24 hours' },
    { value: 72, label: '3 days' },
    { value: 168, label: '7 days' },
];

// AddFrameLayout Modal Component
const AddFrameLayoutModal: React.FC<{
    open: boolean,
    onClose: () => void,
    onFrameLayoutAdded: (newFrameLayoutId?: string, andConfigure?: boolean) => void
}> = ({ open, onClose, onFrameLayoutAdded }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [configureAfterAdd, setConfigureAfterAdd] = useState<boolean>(false);
    const [frameLayout, setFrameLayout] = useState<any>({
        displayName: "",
        layoutType: "",
        description: "",
    });
    const [error, setError] = useState<string>("");

    // Frame layout type options for dropdown
    const frameLayoutTypes = [
        { value: "", name: "Select Frame Layout Type", desc: "Choose a frame layout type to begin" },
        { value: "COMPOSITE_MODE", name: "Composite Mode", desc: "Build dynamic layouts with elements and backgrounds" }
    ];

    // Reset form when modal opens/closes
    useEffect(() => {
        if (open) {
            setFrameLayout({
                displayName: "",
                layoutType: "",
                description: "",
            });
            setError("");
        }
    }, [open]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFrameLayout({ ...frameLayout, [name]: value });
    };

    const handleTypeChange = (e: SelectChangeEvent<string>) => {
        setFrameLayout({ ...frameLayout, layoutType: e.target.value });
    };

    // Handle form submission
    const handleAddFrameLayout = async (configureAfter: boolean = false) => {
        setLoading(true);
        setError("");
        setConfigureAfterAdd(configureAfter);

        if (!frameLayout.displayName || !frameLayout.layoutType) {
            setError("Name and Type are required!");
            setLoading(false);
            return;
        }

        try {
            const newFrameLayout = {
                displayName: frameLayout.displayName,
                layoutType: frameLayout.layoutType,
                description: frameLayout.description,
            };

            const response = await fetch("/api/frameengine", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newFrameLayout),
            });

            if (response.ok) {
                const result = await response.json();
                onFrameLayoutAdded(result.id, configureAfter);
                onClose();
                return;
            }

            const errorData = await response.json();
            throw new Error(errorData.message || "Error adding frame layout");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Set default values based on selected layout type
    useEffect(() => {
        if (frameLayout.layoutType === "COMPOSITE_MODE") {
            setFrameLayout((prev: any) => ({
                ...prev,
                displayName: "Composite Mode Layout",
                description: "Build dynamic layouts with elements and backgrounds"
            }));
        } else {
            setFrameLayout((prev: any) => ({
                ...prev,
                displayName: "",
                description: ""
            }));
        }
    }, [frameLayout.layoutType]);

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: { xs: '95%', sm: '90%', md: '80%' },
                maxWidth: { xs: 'none', md: 900 },
                height: { xs: '90vh', md: '80vh' },
                bgcolor: 'background.paper',
                p: 0,
                boxShadow: 24,
                borderRadius: 2,
                display: 'flex',
                flexDirection: 'column'
            }}>
                <Typography variant="h6" sx={{
                    p: { xs: 2, md: 3 },
                    pb: 2,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    fontSize: { xs: '1.1rem', md: '1.25rem' }
                }}>
                    Add Frame Layout
                </Typography>

                {loading ? (
                    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
                        <CircularProgress size={40} />
                    </Box>
                ) : (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', md: 'row' },
                        flex: 1,
                        overflow: 'hidden'
                    }}>
                        {/* Left side - Layout types list (Desktop only) */}
                        <Box sx={{
                            width: { md: 280 },
                            borderRight: { md: '1px solid' },
                            borderColor: 'divider',
                            overflowY: 'auto',
                            bgcolor: 'action.hover',
                            display: { xs: 'none', md: 'block' }
                        }}>
                            <Typography variant="subtitle2" sx={{ p: 2, pb: 1, fontWeight: 'bold', color: 'text.secondary' }}>
                                Select Frame Layout Type
                            </Typography>
                            {frameLayoutTypes.slice(1).map((layoutType) => (
                                <Box
                                    key={layoutType.value}
                                    onClick={() => setFrameLayout({ ...frameLayout, layoutType: layoutType.value })}
                                    sx={{
                                        p: 2,
                                        mx: 1,
                                        mb: 1,
                                        borderRadius: 1,
                                        cursor: 'pointer',
                                        bgcolor: frameLayout.layoutType === layoutType.value ? 'primary.main' : 'transparent',
                                        color: frameLayout.layoutType === layoutType.value ? 'primary.contrastText' : 'text.primary',
                                        '&:hover': {
                                            bgcolor: frameLayout.layoutType === layoutType.value ? 'primary.dark' : 'action.hover'
                                        },
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={frameLayout.layoutType === layoutType.value ? 'bold' : 'medium'}>
                                        {layoutType.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        opacity: frameLayout.layoutType === layoutType.value ? 0.9 : 0.7,
                                        display: 'block'
                                    }}>
                                        {layoutType.desc}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>

                        {/* Configuration form */}
                        <Box sx={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            order: { xs: 1, md: 2 }
                        }}>
                            <Box sx={{
                                p: { xs: 2, md: 3 },
                                borderBottom: '1px solid',
                                borderColor: 'divider'
                            }}>
                                {error && (
                                    <Alert severity="error" sx={{ mb: 2 }}>
                                        {error}
                                    </Alert>
                                )}

                                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                    {/* Layout Type Dropdown - Mobile only */}
                                    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="frame-layout-type-label">Frame Layout Type *</InputLabel>
                                            <Select
                                                labelId="frame-layout-type-label"
                                                value={frameLayout.layoutType}
                                                onChange={handleTypeChange}
                                                label="Frame Layout Type *"
                                            >
                                                {frameLayoutTypes.map((type) => (
                                                    <MenuItem key={type.value} value={type.value} disabled={type.value === ""}>
                                                        <Box>
                                                            <Typography variant="body2" fontWeight="medium">
                                                                {type.name}
                                                            </Typography>
                                                            {type.value !== "" && (
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {type.desc}
                                                                </Typography>
                                                            )}
                                                        </Box>
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Box>

                                    {/* Only show form fields if layout type is selected */}
                                    {frameLayout.layoutType && (
                                        <>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Frame Layout Name"
                                                name="displayName"
                                                value={frameLayout.displayName}
                                                onChange={handleChange}
                                                required
                                            />

                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Description"
                                                name="description"
                                                value={frameLayout.description}
                                                onChange={handleChange}
                                                multiline
                                                rows={2}
                                            />
                                        </>
                                    )}
                                </Box>
                            </Box>

                            {/* Instructions - responsive height */}
                            {frameLayout.layoutType && (
                                <Box sx={{
                                    flex: 1,
                                    p: { xs: 2, md: 3 },
                                    overflowY: 'auto',
                                    bgcolor: 'background.default',
                                    minHeight: { xs: '200px', md: 'auto' }
                                }}>
                                    <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', md: '1.25rem' } }}>
                                        Frame Layout Information
                                    </Typography>
                                    <SetupInstructions_FrameEngine layoutType={frameLayout.layoutType} />
                                </Box>
                            )}

                            {/* Action buttons - responsive layout */}
                            <Box sx={{
                                p: { xs: 2, md: 3 },
                                borderTop: '1px solid',
                                borderColor: 'divider',
                                display: "flex",
                                flexDirection: { xs: 'column', sm: 'row' },
                                gap: { xs: 1, sm: 2 }
                            }}>
                                <Button
                                    variant="contained"
                                    onClick={() => handleAddFrameLayout(false)}
                                    size="small"
                                    startIcon={<AddIcon />}
                                    disabled={loading || !frameLayout.layoutType}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    {loading && configureAfterAdd ? "Adding..." : "Add & Configure"}
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={onClose}
                                    size="small"
                                    disabled={loading}
                                    sx={{ width: { xs: '100%', sm: 'auto' } }}
                                >
                                    Cancel
                                </Button>
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>
        </Modal>
    );
};

// Main FrameEngine Component
const FrameEngine = () => {
    const [frameLayouts, setFrameLayouts] = useState<FrameLayoutListItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [addFrameLayoutModalOpen, setAddFrameLayoutModalOpen] = useState<boolean>(false);
    const [snackMessage, setSnackMessage] = useState<string | null>(null);
    const [snackbarSeverity, setSnackbarSeverity] = useState<"success" | "info" | "warning" | "error">("success");
    const [importLoading, setImportLoading] = useState<boolean>(false);

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
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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

    // Listen for view mode changes from bottom action bar (mobile only) 
    useEffect(() => {
        const handleBottomActionViewModeChange = (e: CustomEvent) => {
            if (isMobile && e.detail.mode) {
                const newMode = e.detail.mode as ViewMode;
                setViewMode(newMode);
            }
        };

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY_FRAMEENGINE_VIEW_MODE && e.newValue) {
                const newMode = e.newValue as ViewMode;
                setViewMode(newMode);
            }
        };

        if (isMobile) {
            window.addEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange as EventListener);
        }
        window.addEventListener('storage', handleStorageChange);

        return () => {
            if (isMobile) {
                window.removeEventListener('bottom-action-view-mode-change', handleBottomActionViewModeChange as EventListener);
            }
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [isMobile]);

    // Listen for bottom action bar events
    useEffect(() => {
        const handleAddFrameLayout = () => {
            setAddFrameLayoutModalOpen(true);
        };

        window.addEventListener('bottom-action-add-frame', handleAddFrameLayout);

        return () => {
            window.removeEventListener('bottom-action-add-frame', handleAddFrameLayout);
        };
    }, []);

    // Event handlers
    const handleAddFrameLayout = () => {
        setAddFrameLayoutModalOpen(true);
    };

    const handleFrameLayoutAdded = (newFrameLayoutId?: string, andConfigure: boolean = false) => {
        if (andConfigure && newFrameLayoutId) {
            navigate(`/configure-frame/${newFrameLayoutId}`);
        } else {
            fetchFrameLayouts();
            showSnackbar("Frame layout added successfully", "success");
        }
    };

    const handleImportPackage = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.zip')) {
            showSnackbar("Please select a ZIP file", "error");
            return;
        }

        setImportLoading(true);

        try {
            const formData = new FormData();
            formData.append('packageFile', file);

            const response = await fetch('/api/frameengine/import-package', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Import failed');
            }

            const result = await response.json();
            await fetchFrameLayouts();
            showSnackbar(`Frame layout "${result.id}" imported successfully`, "success");
        } catch (error: any) {
            showSnackbar(`Import failed: ${error.message}`, "error");
        } finally {
            setImportLoading(false);
            event.target.value = '';
        }
    };

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
        <Box sx={{ padding: 2 }}>
            {/* Page Header - Hide on mobile */}
            {!isMobile && (
                <Typography variant="h6" sx={{ mb: 2 }}>
                    FrameEngine Management
                </Typography>
            )}

            {/* Management Buttons - Hide on mobile since bottom action bar handles it */}
            {!isMobile && (
                <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={handleAddFrameLayout}
                        size="small"
                        startIcon={<AddIcon />}
                    >
                        Add Frame Layout
                    </Button>

                    <Button
                        variant="outlined"
                        color="primary"
                        component="label"
                        size="small"
                        startIcon={importLoading ? <CircularProgress size={16} /> : <UploadIcon />}
                        disabled={importLoading}
                    >
                        Import Package
                        <input
                            type="file"
                            hidden
                            accept=".zip"
                            onChange={handleImportPackage}
                        />
                    </Button>
                </Box>
            )}

            {/* Filesystem Management Section - Hide on mobile */}
            {!isMobile && (
                <FrameEngineManagementSection onShowSnackbar={showSnackbar} />
            )}

            {/* Listing Section with all view modes */}
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
                isMobile={isMobile}
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

            {/* Add Frame Layout Modal */}
            <AddFrameLayoutModal
                open={addFrameLayoutModalOpen}
                onClose={() => setAddFrameLayoutModalOpen(false)}
                onFrameLayoutAdded={handleFrameLayoutAdded}
            />
        </Box>
    );
};

export default FrameEngine;