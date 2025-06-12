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
    Typography, Box, Table, TableHead,
    TableRow, TableCell, TableBody, Paper,
    Chip, CircularProgress, TableContainer,
    Select, MenuItem, FormControl, SelectChangeEvent
} from "@mui/material";

// Icon imports
import ScreenshotIcon from '@mui/icons-material/Screenshot';
import DevicesIcon from '@mui/icons-material/Devices';

interface DeviceScreenLayoutsCardProps {
    junctionId: number;
    deviceLinks: any[]; // Device links with role="Target"
    loading: boolean;
    showSnackbar: (message: string, severity: "success" | "info" | "warning" | "error") => void;
}

const headerStyle = {
    padding: '8px 16px',
    borderBottom: '2px solid #ddd',
    fontWeight: 'bold',
    backgroundColor: '#f5f5f5'
};

const cellStyle = {
    padding: '6px 16px'
};

const DeviceScreenLayoutsCard: React.FC<DeviceScreenLayoutsCardProps> = ({
    junctionId,
    deviceLinks,
    loading,
    showSnackbar
}) => {
    // State for screens, layouts, and overrides
    const [deviceScreens, setDeviceScreens] = useState<{ [deviceId: number]: any[] }>({});
    const [allLayouts, setAllLayouts] = useState<any[]>([]);
    const [screenLayoutOverrides, setScreenLayoutOverrides] = useState<{ [key: string]: any }>({});
    const [loadingState, setLoadingState] = useState<{ [key: string]: boolean }>({});

    // Filter to only include device links that are targets
    const targetDeviceLinks = deviceLinks.filter(link =>
        link.type === "device" && link.role === "Target"
    );

    // Fetch all layouts
    const fetchLayouts = async () => {
        try {
            setLoadingState(prev => ({ ...prev, layouts: true }));
            const response = await fetch('/api/layouts');

            if (!response.ok) {
                throw new Error(`Failed to fetch layouts: ${response.status}`);
            }

            const data = await response.json();
            setAllLayouts(data);
        } catch (error) {
            console.error("Error fetching layouts:", error);
            showSnackbar("Failed to load screen layouts", "error");
        } finally {
            setLoadingState(prev => ({ ...prev, layouts: false }));
        }
    };

    // Try to fetch screen layout overrides
    const fetchScreenLayoutOverrides = async (junctionId: number, linkId: number) => {
        try {
            setLoadingState(prev => ({ ...prev, [`overrides-${linkId}`]: true }));

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts`);

            if (response.ok) {
                const data = await response.json();

                // Store device screens from this response
                if (data.deviceScreens && data.deviceScreens.length > 0) {
                    const deviceId = data.deviceScreens[0].deviceId; // All screens should have same deviceId

                    setDeviceScreens(prev => ({
                        ...prev,
                        [deviceId]: data.deviceScreens
                    }));
                }

                // Process overrides
                const overrides = data.screenLayoutOverrides || [];
                const newOverrides = { ...screenLayoutOverrides };

                overrides.forEach((override: any) => {
                    const screenId = override.deviceScreenId;
                    const key = `${linkId}-${screenId}`;
                    newOverrides[key] = override;
                });

                setScreenLayoutOverrides(newOverrides);
            } else {
                console.error(`Failed to fetch screen layout overrides: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error fetching screen layout overrides for link ${linkId}:`, error);
        } finally {
            setLoadingState(prev => ({ ...prev, [`overrides-${linkId}`]: false }));
        }
    };

    // Load data on component mount
    useEffect(() => {
        fetchLayouts();

        targetDeviceLinks.forEach(link => {
            if (link.linkId) {
                fetchScreenLayoutOverrides(junctionId, link.linkId);
            }
        });
    }, [targetDeviceLinks.map(link => `${link.id}-${link.linkId}`).join(',')]);

    // Handle layout change
    // Handle layout change
    const handleLayoutChange = async (linkId: number, screenId: number, layoutId: number | null, defaultLayoutId: number | null) => {
        const key = `${linkId}-${screenId}`;
        try {
            setLoadingState(prev => ({ ...prev, [key]: true }));

            const existingOverride = screenLayoutOverrides[key];

            // First, remove any existing override if it exists
            if (existingOverride && existingOverride.id) {
                try {
                    const deleteResponse = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts/${existingOverride.id}`, {
                        method: "DELETE"
                    });

                    if (!deleteResponse.ok) {
                        console.warn(`Warning: Failed to remove existing layout override: ${deleteResponse.status}`);
                        // Continue anyway - we'll try to create a new one
                    }

                    // Remove from local state
                    const newOverrides = { ...screenLayoutOverrides };
                    delete newOverrides[key];
                    setScreenLayoutOverrides(newOverrides);
                } catch (deleteError) {
                    console.warn("Warning: Error removing existing override:", deleteError);
                    // Continue anyway
                }
            }

            // If we're setting to default/null, we're done (we already deleted the override)
            if (layoutId === defaultLayoutId || layoutId === null) {
                showSnackbar("Reverted to default layout", "success");
                return;
            }

            // Create a new override with POST
            const payload = {
                screenId: screenId,
                screenLayoutId: layoutId,
                deviceScreenId: screenId.toString()
            };

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to add layout override: ${response.status}`);
            }

            const data = await response.json();

            // Update state with new override
            setScreenLayoutOverrides(prev => ({
                ...prev,
                [key]: data
            }));

            showSnackbar("Screen layout override added successfully", "success");
        } catch (error) {
            console.error("Error managing layout override:", error);
            showSnackbar("Failed to save screen layout override", "error");
        } finally {
            setLoadingState(prev => ({ ...prev, [key]: false }));
        }
    };

    // Get layout name by ID
    const getLayoutName = (layoutId: number) => {
        const layout = allLayouts.find(l => l.id === layoutId);
        return layout ? layout.displayName : "Unknown Layout";
    };

    // Get current layout ID (override or default)
    const getCurrentLayoutId = (screenId: number, defaultLayoutId: number | null, linkId: number) => {
        const key = `${linkId}-${screenId}`;
        const override = screenLayoutOverrides[key];
        return override ? override.screenLayoutId : defaultLayoutId;
    };

    if (loading || loadingState.layouts) {
        return (
            <Box display="flex" justifyContent="center" my={4}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
            <Typography variant="h6" sx={{
                display: 'flex',
                alignItems: 'center',
                mb: 2
            }}>
                <ScreenshotIcon sx={{ mr: 1 }} />
                Device Screen Layout Overrides
            </Typography>

            {targetDeviceLinks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No target devices available. Add devices as targets to configure their screen layouts.
                </Typography>
            ) : (
                <Box>
                    {targetDeviceLinks.map(link => {
                        const deviceId = link.id;
                        const linkId = link.linkId;
                        const isLoadingDevice = loadingState[`device-${deviceId}`] || false;
                        const screens = deviceScreens[deviceId] || [];

                        return (
                            <Paper
                                key={`device-screens-${linkId}`}
                                variant="outlined"
                                sx={{ mb: 2, p: 2 }}
                            >
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                                    <Typography variant="subtitle1" sx={{
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}>
                                        <DevicesIcon fontSize="small" sx={{ mr: 1, color: "primary.main" }} />
                                        {link.name}
                                    </Typography>
                                </Box>

                                {isLoadingDevice ? (
                                    <Box display="flex" justifyContent="center" my={2}>
                                        <CircularProgress size={24} />
                                    </Box>
                                ) : screens.length === 0 ? (
                                    <Typography variant="body2" color="text.secondary">
                                        No screens available for this device.
                                    </Typography>
                                ) : (
                                    <TableContainer>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={headerStyle}>Screen</TableCell>
                                                    <TableCell sx={headerStyle}>Layout</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {screens.map((screen: any) => {
                                                    const screenId = screen.id;
                                                    const key = `${linkId}-${screenId}`;
                                                    const defaultLayoutId = screen.screenLayoutId;
                                                    const currentLayoutId = getCurrentLayoutId(screenId, defaultLayoutId, linkId);
                                                    const isOverridden = Boolean(screenLayoutOverrides[key]);
                                                    const isLoading = loadingState[key] || false;

                                                    return (
                                                        <TableRow key={`screen-${screenId}`} hover>
                                                            <TableCell sx={cellStyle}>
                                                                <Typography variant="body2" fontWeight="medium">
                                                                    {screen.displayName || screen.screenKey}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell sx={cellStyle}>
                                                                <Box display="flex" alignItems="center">
                                                                    <FormControl fullWidth size="small">
                                                                        <Select
                                                                            value={String(currentLayoutId || "")}
                                                                            onChange={(e: SelectChangeEvent) => {
                                                                                const newLayoutId = e.target.value === "" ? null : parseInt(e.target.value, 10);
                                                                                handleLayoutChange(linkId, screenId, newLayoutId, screen.screenLayoutId);
                                                                            }}
                                                                            displayEmpty
                                                                            disabled={isLoading}
                                                                        >
                                                                            <MenuItem value="">
                                                                                <em>Use default</em>
                                                                            </MenuItem>
                                                                            {allLayouts.map((layout: any) => (
                                                                                <MenuItem
                                                                                    key={`layout-${layout.id}`}
                                                                                    value={layout.id.toString()}
                                                                                >
                                                                                    {layout.displayName}
                                                                                </MenuItem>
                                                                            ))}
                                                                        </Select>
                                                                    </FormControl>
                                                                    {isOverridden && (
                                                                        <Chip
                                                                            size="small"
                                                                            label="Override"
                                                                            color="primary"
                                                                            variant="outlined"
                                                                            sx={{ ml: 2 }}
                                                                        />
                                                                    )}
                                                                    {isLoading && (
                                                                        <CircularProgress size={16} sx={{ ml: 2 }} />
                                                                    )}
                                                                </Box>
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}
                            </Paper>
                        );
                    })}
                </Box>
            )}
        </Paper>
    );
};

export default DeviceScreenLayoutsCard;