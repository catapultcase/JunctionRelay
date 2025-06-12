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

import React, { useState, useEffect } from "react";
import {
    Button,
    Typography,
    Box,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Modal,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Snackbar,
    Alert,
    IconButton,
    AlertColor,
    Tooltip
} from "@mui/material";
import { SelectChangeEvent } from "@mui/material/Select";
import { useNavigate } from "react-router-dom";
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';

//
// Interfaces
//
interface LayoutListItem {
    id: string;
    isTemplate?: boolean;
    displayName: string;
    description?: string;
    layoutType: string;
    rows?: number;
    columns?: number;
}

interface AddLayoutModalProps {
    open: boolean;
    onClose: () => void;
    onLayoutAdded: (newLayoutId?: string, andConfigure?: boolean) => void;
}

interface LayoutInfo {
    displayName: string;
    layoutType: string;
}

//
// AddLayoutModal component (unchanged)
//
const AddLayoutModal: React.FC<AddLayoutModalProps> = ({ open, onClose, onLayoutAdded }) => {
    const [loading, setLoading] = useState<boolean>(false);
    const [layoutInfo, setLayoutInfo] = useState<LayoutInfo>({
        displayName: "",
        layoutType: "LVGL_GRID"
    });
    const [error, setError] = useState<string>("");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setLayoutInfo({ ...layoutInfo, [name]: value });
    };

    const handleTypeChange = (e: SelectChangeEvent<string>) => {
        setLayoutInfo({ ...layoutInfo, layoutType: e.target.value });
    };

    const handleAddLayout = async (andConfigure: boolean = false) => {
        setLoading(true);
        setError("");

        if (!layoutInfo.displayName) {
            setError("Layout Name is required!");
            setLoading(false);
            return;
        }

        try {
            const newLayout = {
                displayName: layoutInfo.displayName,
                layoutType: layoutInfo.layoutType,
                description: "",
                rows: 2,
                columns: 2
            };

            const response = await fetch("/api/layouts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newLayout),
            });
            const result = await response.json();

            if (response.ok) {
                onLayoutAdded(result.id, andConfigure);
                onClose();
            } else {
                throw new Error(result.message || "Error adding layout");
            }
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unknown error occurred");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                width: '80%', maxWidth: 600, bgcolor: 'background.paper', p: 4, boxShadow: 24, borderRadius: 2
            }}>
                <Typography variant="h6" gutterBottom>Add Layout</Typography>
                {loading ? (
                    <CircularProgress />
                ) : (
                    <>
                        {error && <Typography color="error">{error}</Typography>}
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <input
                                type="text"
                                name="displayName"
                                placeholder="Layout Name"
                                value={layoutInfo.displayName}
                                onChange={handleChange}
                                required
                                style={{ padding: "8px", fontSize: "16px" }}
                            />
                            <FormControl fullWidth>
                                <InputLabel id="layout-type-label">Layout Type</InputLabel>
                                <Select
                                    labelId="layout-type-label"
                                    value={layoutInfo.layoutType}
                                    onChange={handleTypeChange}
                                    label="Layout Type"
                                >
                                    <MenuItem value="LVGL_GRID">LVGL Grid</MenuItem>
                                    <MenuItem value="LVGL_RADIO">LVGL Radio</MenuItem>
                                    <MenuItem value="LVGL_PLOTTER">LVGL Plotter</MenuItem>
                                    <MenuItem value="QUAD">QUAD</MenuItem>
                                    <MenuItem value="MATRIX">MATRIX</MenuItem>
                                    <MenuItem value="NEOPIXEL">NEOPIXEL</MenuItem>
                                    <MenuItem value="CUSTOM">CUSTOM</MenuItem>
                                </Select>
                            </FormControl>
                        </Box>
                        <Box sx={{ display: "flex", gap: 2, marginTop: 2 }}>
                            <Button variant="contained" onClick={() => handleAddLayout(false)}>
                                {loading ? "Adding..." : "Add Layout"}
                            </Button>
                            <Button variant="contained" color="primary" onClick={() => handleAddLayout(true)}>
                                Add and Configure
                            </Button>
                            <Button variant="outlined" onClick={onClose}>Cancel</Button>
                        </Box>
                    </>
                )}
            </Box>
        </Modal>
    );
};

//
// Main Layouts component
//
const Layouts: React.FC = () => {
    const [layouts, setLayouts] = useState<LayoutListItem[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [resetLoading, setResetLoading] = useState<boolean>(false);
    const [addLayoutModalOpen, setAddLayoutModalOpen] = useState<boolean>(false);
    const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
    const [snackbarMessage, setSnackbarMessage] = useState<string>("");
    const [snackbarSeverity, setSnackbarSeverity] = useState<AlertColor>("success");

    const navigate = useNavigate();

    const showSnackbar = (message: string, severity: AlertColor = "success") => {
        setSnackbarMessage(message);
        setSnackbarSeverity(severity);
        setSnackbarOpen(true);
    };

    const fetchLayouts = async () => {
        try {
            setLoading(true);
            const response = await fetch("/api/layouts");
            const data = await response.json();
            setLayouts(data);
        } catch {
            showSnackbar("Error fetching layouts", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleResetAll = async () => {
        setResetLoading(true);
        try {
            const response = await fetch("/api/layouts/restoreAll", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });
            if (!response.ok) {
                throw new Error("Failed to reset all templates");
            }
            await fetchLayouts();
            showSnackbar("All templates have been restored or reset to defaults");
        } catch {
            showSnackbar("Error resetting layouts", "error");
        } finally {
            setResetLoading(false);
        }
    };

    useEffect(() => {
        fetchLayouts();
    }, []);

    const handleRowClick = (layout: LayoutListItem) => {
        navigate(`/configure-payload/${layout.id}`);
    };

    const handleEdit = (e: React.MouseEvent, layout: LayoutListItem) => {
        e.stopPropagation();
        navigate(`/configure-payload/${layout.id}`);
    };

    const handleDelete = async (e: React.MouseEvent, layoutId: string) => {
        e.stopPropagation();
        if (!window.confirm("Are you sure you want to delete this layout?")) return;
        try {
            const resp = await fetch(`/api/layouts/${layoutId}`, { method: "DELETE" });
            if (!resp.ok) throw new Error();
            await fetchLayouts();
            showSnackbar("Layout deleted successfully");
        } catch {
            showSnackbar("Error deleting layout", "error");
        }
    };

    const handleClone = async (e: React.MouseEvent, layout: LayoutListItem) => {
        e.stopPropagation();
        try {
            const originalId = parseInt(layout.id, 10);
            const resp = await fetch("/api/layouts/clone", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ originalId })
            });
            if (!resp.ok) throw new Error();
            await fetchLayouts();
            showSnackbar("Layout cloned successfully");
        } catch {
            showSnackbar("Error cloning layout", "error");
        }
    };

    const handleAddLayout = () => setAddLayoutModalOpen(true);

    const handleLayoutAdded = (newLayoutId?: string, andConfigure: boolean = false) => {
        if (andConfigure && newLayoutId) {
            navigate(`/configure-payload/${newLayoutId}`);
        } else {
            fetchLayouts();
            showSnackbar("Layout added successfully");
        }
    };

    return (
        <Box sx={{ padding: 2 }}>
            <Typography variant="h5" gutterBottom>Payloads</Typography>

            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={handleAddLayout}
                    size="small"
                >
                    Add Layout
                </Button>

                <Button
                    variant="outlined"
                    startIcon={resetLoading ? <CircularProgress size={16} /> : <RefreshIcon />}
                    onClick={handleResetAll}
                    size="small"
                    disabled={resetLoading}
                >
                    Reset/Restore All Payload Templates
                </Button>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                    <CircularProgress size={24} />
                </Box>
            ) : (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Template</TableCell>
                                <TableCell>Description</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Rows</TableCell>
                                <TableCell>Columns</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {layouts.map(layout => (
                                <TableRow
                                    key={layout.id}
                                    hover
                                    sx={{ cursor: "pointer" }}
                                    onClick={() => handleRowClick(layout)}
                                >
                                    <TableCell>{layout.displayName}</TableCell>
                                    <TableCell>
                                        {layout.isTemplate ? (
                                            <CheckIcon fontSize="small" sx={{ color: "success.main" }} />
                                        ) : (
                                            ""
                                        )}
                                    </TableCell>
                                    <TableCell>{layout.description || "—"}</TableCell>
                                    <TableCell>{layout.layoutType}</TableCell>
                                    <TableCell>{layout.rows}</TableCell>
                                    <TableCell>{layout.columns}</TableCell>
                                    <TableCell align="right">
                                        {!layout.isTemplate && (
                                            <>
                                                <Tooltip title="Edit">
                                                    <IconButton size="small" onClick={e => handleEdit(e, layout)}>
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </>
                                        )}

                                        <Tooltip title="Clone">
                                            <IconButton size="small" onClick={e => handleClone(e, layout)}>
                                                <ContentCopyIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>

                                        {!layout.isTemplate && (
                                            <Tooltip title="Delete">
                                                <IconButton size="small" onClick={e => handleDelete(e, layout.id)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </TableCell>

                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            <Snackbar
                open={snackbarOpen}
                autoHideDuration={6000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert onClose={() => setSnackbarOpen(false)} severity={snackbarSeverity} sx={{ width: "100%" }}>
                    {snackbarMessage}
                </Alert>
            </Snackbar>

            <AddLayoutModal
                open={addLayoutModalOpen}
                onClose={() => setAddLayoutModalOpen(false)}
                onLayoutAdded={handleLayoutAdded}
            />
        </Box>
    );
};

export default Layouts;
