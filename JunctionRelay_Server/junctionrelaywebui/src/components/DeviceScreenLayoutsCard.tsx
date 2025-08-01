import React, { useState, useEffect } from "react";
import {
    Typography, Box, Table, TableHead,
    TableRow, TableCell, TableBody, Paper,
    Chip, CircularProgress, TableContainer,
    Select, MenuItem, FormControl, SelectChangeEvent,
    TextField, Switch, FormControlLabel, InputLabel,
    Card, CardContent, Button, Link, Tooltip,
    IconButton
} from "@mui/material";

// Icon imports
import ScreenshotIcon from '@mui/icons-material/Screenshot';
import DevicesIcon from '@mui/icons-material/Devices';
import SettingsIcon from '@mui/icons-material/Settings';
import ImageIcon from '@mui/icons-material/Image';
import SaveIcon from '@mui/icons-material/Save';
import LinkIcon from '@mui/icons-material/Link';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

interface DeviceScreenLayoutsCardProps {
    junctionId: number;
    junction: any; // Junction object with renderingMode property
    deviceLinks: any[]; // Device links with role="Target"
    loading: boolean;
    showSnackbar: (message: string, severity: "success" | "info" | "warning" | "error") => void;
    onJunctionUpdate?: (updatedJunction: any) => void; // Callback to update parent component
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

interface ScreenLayoutConfig {
    id?: number;
    deviceScreenId: number;
    screenLayoutId?: number; // For payload mode
    frameLayoutId?: number; // For frame engine mode
    targetPollRate?: number;
    onlySendIfChanged: boolean;
    enableUrlAccess?: boolean; // New field
    urlPath?: string; // New field
    lastRequested?: string; // New field
}

const DeviceScreenLayoutsCard: React.FC<DeviceScreenLayoutsCardProps> = ({
    junctionId,
    junction,
    deviceLinks,
    loading,
    showSnackbar,
    onJunctionUpdate
}) => {
    // State for screens, layouts, and configurations
    const [deviceScreens, setDeviceScreens] = useState<{ [deviceId: number]: any[] }>({});
    const [screenLayouts, setScreenLayouts] = useState<any[]>([]); // Legacy layouts
    const [frameLayouts, setFrameLayouts] = useState<any[]>([]); // Frame engine layouts
    const [screenConfigs, setScreenConfigs] = useState<{ [key: string]: ScreenLayoutConfig }>({});
    const [loadingState, setLoadingState] = useState<{ [key: string]: boolean }>({});
    const [savingRenderingMode, setSavingRenderingMode] = useState<boolean>(false);

    // Determine rendering mode
    const isFrameEngine = junction?.renderingMode === "FrameEngine";
    const availableLayouts = isFrameEngine ? frameLayouts : screenLayouts;

    // Filter to only include device links that are targets
    const targetDeviceLinks = deviceLinks.filter(link =>
        link.type === "device" && link.role === "Target"
    );

    // Get base URL for frame access
    const getBaseUrl = () => {
        return `${window.location.protocol}//${window.location.host}`;
    };

    // Copy URL to clipboard
    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            showSnackbar("URL copied to clipboard", "success");
        } catch (err) {
            showSnackbar("Failed to copy URL", "error");
        }
    };

    // Fetch screen layouts (legacy)
    const fetchScreenLayouts = async () => {
        try {
            setLoadingState(prev => ({ ...prev, screenLayouts: true }));
            const response = await fetch('/api/layouts');

            if (!response.ok) {
                throw new Error(`Failed to fetch screen layouts: ${response.status}`);
            }

            const data = await response.json();
            setScreenLayouts(data);
        } catch (error) {
            console.error("Error fetching screen layouts:", error);
            showSnackbar("Failed to load screen layouts", "error");
        } finally {
            setLoadingState(prev => ({ ...prev, screenLayouts: false }));
        }
    };

    // Fetch frame layouts (new frame engine)
    const fetchFrameLayouts = async () => {
        try {
            setLoadingState(prev => ({ ...prev, frameLayouts: true }));
            const response = await fetch('/api/frameengine');

            if (!response.ok) {
                throw new Error(`Failed to fetch frame layouts: ${response.status}`);
            }

            const data = await response.json();
            setFrameLayouts(data);
        } catch (error) {
            console.error("Error fetching frame layouts:", error);
            showSnackbar("Failed to load frame layouts", "error");
        } finally {
            setLoadingState(prev => ({ ...prev, frameLayouts: false }));
        }
    };

    // Fetch screen configurations for a specific device link
    const fetchScreenConfigs = async (junctionId: number, linkId: number) => {
        try {
            setLoadingState(prev => ({ ...prev, [`configs-${linkId}`]: true }));

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts`);

            if (response.ok) {
                const data = await response.json();

                // Store device screens from this response
                if (data.deviceScreens && data.deviceScreens.length > 0) {
                    const deviceId = data.deviceScreens[0].deviceId;
                    setDeviceScreens(prev => ({
                        ...prev,
                        [deviceId]: data.deviceScreens
                    }));
                }

                // Process screen configurations
                const configs = data.screenLayoutOverrides || [];
                const newConfigs = { ...screenConfigs };

                configs.forEach((config: any) => {
                    const screenId = config.deviceScreenId;
                    const key = `${linkId}-${screenId}`;
                    newConfigs[key] = {
                        id: config.id,
                        deviceScreenId: config.deviceScreenId,
                        screenLayoutId: config.screenLayoutId,
                        frameLayoutId: config.frameLayoutId,
                        targetPollRate: config.targetPollRate,
                        onlySendIfChanged: config.onlySendIfChanged ?? true,
                        enableUrlAccess: config.enableUrlAccess ?? false,
                        urlPath: config.urlPath,
                        lastRequested: config.lastRequested
                    };
                });

                setScreenConfigs(newConfigs);
            } else {
                console.error(`Failed to fetch screen configurations: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error fetching screen configurations for link ${linkId}:`, error);
        } finally {
            setLoadingState(prev => ({ ...prev, [`configs-${linkId}`]: false }));
        }
    };

    // Load data on component mount
    useEffect(() => {
        fetchScreenLayouts();
        fetchFrameLayouts();

        targetDeviceLinks.forEach(link => {
            if (link.linkId) {
                fetchScreenConfigs(junctionId, link.linkId);
            }
        });
    }, [targetDeviceLinks.map(link => `${link.id}-${link.linkId}`).join(','), junction?.renderingMode]);

    // Handle layout change
    const handleLayoutChange = async (linkId: number, screenId: number, layoutId: number | null, defaultLayoutId: number | null) => {
        const key = `${linkId}-${screenId}`;
        try {
            setLoadingState(prev => ({ ...prev, [key]: true }));

            const existingConfig = screenConfigs[key];

            // Remove existing configuration if it exists
            if (existingConfig && existingConfig.id) {
                try {
                    const deleteResponse = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts/${existingConfig.id}`, {
                        method: "DELETE"
                    });

                    if (!deleteResponse.ok) {
                        console.warn(`Warning: Failed to remove existing configuration: ${deleteResponse.status}`);
                    }

                    // Remove from local state
                    const newConfigs = { ...screenConfigs };
                    delete newConfigs[key];
                    setScreenConfigs(newConfigs);
                } catch (deleteError) {
                    console.warn("Warning: Error removing existing configuration:", deleteError);
                }
            }

            // If setting to default/null, we're done
            if (layoutId === defaultLayoutId || layoutId === null) {
                showSnackbar("Reverted to default layout", "success");
                return;
            }

            // Create new configuration
            const payload: any = {
                deviceScreenId: screenId,
                targetPollRate: existingConfig?.targetPollRate,
                onlySendIfChanged: existingConfig?.onlySendIfChanged ?? true,
                enableUrlAccess: existingConfig?.enableUrlAccess ?? false,
                urlPath: existingConfig?.urlPath
            };

            // Set the appropriate layout ID based on rendering mode
            if (isFrameEngine) {
                payload.frameLayoutId = layoutId;
            } else {
                payload.screenLayoutId = layoutId;
            }

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to save layout configuration: ${response.status}`);
            }

            const data = await response.json();

            // Update state with new configuration
            setScreenConfigs(prev => ({
                ...prev,
                [key]: {
                    id: data.id,
                    deviceScreenId: screenId,
                    screenLayoutId: data.screenLayoutId,
                    frameLayoutId: data.frameLayoutId,
                    targetPollRate: data.targetPollRate,
                    onlySendIfChanged: data.onlySendIfChanged ?? true,
                    enableUrlAccess: data.enableUrlAccess ?? false,
                    urlPath: data.urlPath,
                    lastRequested: data.lastRequested
                }
            }));

            showSnackbar(`${isFrameEngine ? 'Frame' : 'Screen'} layout configuration saved successfully`, "success");
        } catch (error) {
            console.error("Error managing layout configuration:", error);
            showSnackbar(`Failed to save ${isFrameEngine ? 'frame' : 'screen'} layout configuration`, "error");
        } finally {
            setLoadingState(prev => ({ ...prev, [key]: false }));
        }
    };

    // Handle URL access toggle
    const handleUrlAccessToggle = async (linkId: number, screenId: number) => {
        const key = `${linkId}-${screenId}`;

        try {
            const existingConfig = screenConfigs[key];

            if (!existingConfig || !existingConfig.id) {
                showSnackbar("Please assign a layout first before enabling URL access", "warning");
                return;
            }

            const newValue = !existingConfig.enableUrlAccess;
            let newUrlPath = existingConfig.urlPath;

            // Generate URL path if enabling and none exists
            if (newValue && !newUrlPath) {
                newUrlPath = `junction-${junctionId}-link-${linkId}-screen-${screenId}.png`;
            }

            const payload = {
                deviceScreenId: screenId,
                screenLayoutId: existingConfig.screenLayoutId,
                frameLayoutId: existingConfig.frameLayoutId,
                targetPollRate: existingConfig.targetPollRate,
                onlySendIfChanged: existingConfig.onlySendIfChanged,
                enableUrlAccess: newValue,
                urlPath: newUrlPath
            };

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts/${existingConfig.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to update URL access: ${response.status}`);
            }

            // Update local state
            setScreenConfigs(prev => ({
                ...prev,
                [key]: {
                    ...existingConfig,
                    enableUrlAccess: newValue,
                    urlPath: newUrlPath
                }
            }));

            showSnackbar(`URL access ${newValue ? 'enabled' : 'disabled'} successfully`, "success");

        } catch (error) {
            console.error("Error updating URL access:", error);
            showSnackbar("Failed to update URL access", "error");
        }
    };

    // Handle poll rate change
    const handlePollRateChange = async (linkId: number, screenId: number, pollRate: string) => {
        const key = `${linkId}-${screenId}`;
        const numericRate = pollRate === "" ? undefined : parseInt(pollRate, 10);

        try {
            const existingConfig = screenConfigs[key];

            if (!existingConfig || !existingConfig.id) {
                showSnackbar("Please assign a layout first before setting poll rate", "warning");
                return;
            }

            const payload = {
                deviceScreenId: screenId,
                screenLayoutId: existingConfig.screenLayoutId,
                frameLayoutId: existingConfig.frameLayoutId,
                targetPollRate: numericRate,
                onlySendIfChanged: existingConfig.onlySendIfChanged,
                enableUrlAccess: existingConfig.enableUrlAccess,
                urlPath: existingConfig.urlPath
            };

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts/${existingConfig.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to update poll rate: ${response.status}`);
            }

            // Update local state
            setScreenConfigs(prev => ({
                ...prev,
                [key]: {
                    ...existingConfig,
                    targetPollRate: numericRate
                }
            }));

        } catch (error) {
            console.error("Error updating poll rate:", error);
            showSnackbar("Failed to update poll rate", "error");
        }
    };

    // Handle "only send if changed" toggle
    const handleOnlySendIfChangedToggle = async (linkId: number, screenId: number) => {
        const key = `${linkId}-${screenId}`;

        try {
            const existingConfig = screenConfigs[key];

            if (!existingConfig || !existingConfig.id) {
                showSnackbar("Please assign a layout first before changing send options", "warning");
                return;
            }

            const newValue = !existingConfig.onlySendIfChanged;

            const payload = {
                deviceScreenId: screenId,
                screenLayoutId: existingConfig.screenLayoutId,
                frameLayoutId: existingConfig.frameLayoutId,
                targetPollRate: existingConfig.targetPollRate,
                onlySendIfChanged: newValue,
                enableUrlAccess: existingConfig.enableUrlAccess,
                urlPath: existingConfig.urlPath
            };

            const response = await fetch(`/api/junctions/${junctionId}/links/device-links/${linkId}/screen-layouts/${existingConfig.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Failed to update send option: ${response.status}`);
            }

            // Update local state
            setScreenConfigs(prev => ({
                ...prev,
                [key]: {
                    ...existingConfig,
                    onlySendIfChanged: newValue
                }
            }));

        } catch (error) {
            console.error("Error updating send option:", error);
            showSnackbar("Failed to update send option", "error");
        }
    };

    // Handle rendering mode change
    const handleRenderingModeChange = async (newMode: string) => {
        try {
            setSavingRenderingMode(true);

            const response = await fetch(`/api/junctions/${junctionId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...junction,
                    renderingMode: newMode
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to update rendering mode: ${response.status}`);
            }

            // Update local junction state
            const updatedJunction = { ...junction, renderingMode: newMode };

            // Call parent callback if provided
            if (onJunctionUpdate) {
                onJunctionUpdate(updatedJunction);
            }

            showSnackbar(`Switched to ${newMode === "FrameEngine" ? "Frame Engine" : "Payload"} mode successfully`, "success");

            // Refresh screen configurations since they may be different for the new mode
            targetDeviceLinks.forEach(link => {
                if (link.linkId) {
                    fetchScreenConfigs(junctionId, link.linkId);
                }
            });

        } catch (error) {
            console.error("Error updating rendering mode:", error);
            showSnackbar("Failed to update rendering mode", "error");
        } finally {
            setSavingRenderingMode(false);
        }
    };

    // Get layout name by ID
    const getLayoutName = (layoutId: number) => {
        const layout = availableLayouts.find(l => l.id === layoutId);
        return layout ? layout.displayName : "Unknown Layout";
    };

    // Get current layout ID (configuration or default)
    const getCurrentLayoutId = (screenId: number, defaultLayoutId: number | null, linkId: number) => {
        const key = `${linkId}-${screenId}`;
        const config = screenConfigs[key];

        if (config) {
            return isFrameEngine ? config.frameLayoutId : config.screenLayoutId;
        }

        return defaultLayoutId;
    };

    // Generate frame URL for display
    const generateFrameUrl = (linkId: number, screenId: number) => {
        const key = `${linkId}-${screenId}`;
        const config = screenConfigs[key];

        if (!config?.enableUrlAccess || !config.urlPath) {
            return "";
        }

        return `${getBaseUrl()}/frames/${config.urlPath}`;
    };

    if (loading || loadingState.screenLayouts || loadingState.frameLayouts) {
        return (
            <Box display="flex" justifyContent="center" my={4}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
            {/* Rendering Mode Configuration Card */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SettingsIcon />
                        Rendering Mode Configuration
                    </Typography>

                    <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                            <InputLabel>Rendering Mode</InputLabel>
                            <Select
                                value={junction?.renderingMode || "Payload"}
                                label="Rendering Mode"
                                onChange={(e) => handleRenderingModeChange(e.target.value)}
                                disabled={savingRenderingMode || loading}
                            >
                                <MenuItem value="Payload">Payload Mode</MenuItem>
                                <MenuItem value="FrameEngine">Frame Engine Mode</MenuItem>
                            </Select>
                        </FormControl>

                        <Chip
                            label={isFrameEngine ? "Frame Engine Active" : "Payload Mode Active"}
                            color={isFrameEngine ? "primary" : "default"}
                            size="small"
                            icon={isFrameEngine ? <ImageIcon /> : <ScreenshotIcon />}
                        />

                        {savingRenderingMode && <CircularProgress size={20} />}
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        {isFrameEngine ? (
                            <>
                                <strong>Frame Engine Mode:</strong> Uses the FrameEngine to render complete images and push per-frame. The receiving device should handle only the displaying of these final images.
                            </>
                        ) : (
                            <>
                                <strong>Payload Mode:</strong> Uses the Payload system to send raw data payloads to target devices using legacy screen layouts. The receiving device should handle rendering/display logic.
                            </>
                        )}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        <strong>Target Poll Rate (ms):</strong> If you want the target device to "request" new data, instead of the backend sending new payloads at the send rate frequency, enter that desired frequency here.
                    </Typography>
                </CardContent>
            </Card>

            {/* Screen Configurations */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    {isFrameEngine ? <ImageIcon sx={{ mr: 1 }} /> : <ScreenshotIcon sx={{ mr: 1 }} />}
                    {isFrameEngine ? "Frame Engine Configurations" : "Screen Layout Overrides"}
                </Typography>
            </Box>

            {targetDeviceLinks.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No target devices available. Add devices as targets to configure their {isFrameEngine ? 'frame layouts' : 'screen layouts'}.
                </Typography>
            ) : (
                <Box>
                    {targetDeviceLinks.map(link => {
                        const deviceId = link.id;
                        const linkId = link.linkId;
                        const isLoadingDevice = loadingState[`configs-${linkId}`] || false;
                        const screens = deviceScreens[deviceId] || [];

                        return (
                            <Paper
                                key={`device-screens-${linkId}`}
                                variant="outlined"
                                sx={{ mb: 2, p: { xs: 1, sm: 2 } }}
                            >
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} sx={{ flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1, sm: 0 } }}>
                                    <Typography variant="subtitle1" sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        fontSize: { xs: '0.9rem', sm: '1rem' }
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
                                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                                        No screens available for this device.
                                    </Typography>
                                ) : (
                                    <Box sx={{ overflowX: 'auto' }}>
                                        <Table size="small" sx={{ minWidth: { xs: 600, sm: 'auto' } }}>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ ...headerStyle, minWidth: { xs: 120, sm: 'auto' } }}>Screen</TableCell>
                                                    <TableCell sx={{ ...headerStyle, minWidth: { xs: 200, sm: 'auto' } }}>
                                                        {isFrameEngine ? "Frame Layout" : "Screen Layout"}
                                                    </TableCell>
                                                    <TableCell sx={{ ...headerStyle, minWidth: { xs: 100, sm: 'auto' } }}>Target Poll Rate (ms)</TableCell>
                                                    <TableCell sx={{ ...headerStyle, minWidth: { xs: 120, sm: 'auto' } }}>Only Send If Data Changed</TableCell>
                                                    {isFrameEngine && (
                                                        <TableCell sx={{ ...headerStyle, minWidth: { xs: 150, sm: 'auto' } }}>External URL Access</TableCell>
                                                    )}
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {screens.map((screen: any) => {
                                                    const screenId = screen.id;
                                                    const key = `${linkId}-${screenId}`;
                                                    const defaultLayoutId = screen.screenLayoutId;
                                                    const currentLayoutId = getCurrentLayoutId(screenId, defaultLayoutId, linkId);
                                                    const config = screenConfigs[key];
                                                    const isConfigured = Boolean(config);
                                                    const isLoading = loadingState[key] || false;
                                                    const frameUrl = generateFrameUrl(linkId, screenId);

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
                                                                                handleLayoutChange(linkId, screenId, newLayoutId, defaultLayoutId);
                                                                            }}
                                                                            displayEmpty
                                                                            disabled={isLoading}
                                                                        >
                                                                            <MenuItem value="">
                                                                                <em>Use default</em>
                                                                            </MenuItem>
                                                                            {availableLayouts.map((layout: any) => (
                                                                                <MenuItem
                                                                                    key={`layout-${layout.id}`}
                                                                                    value={layout.id.toString()}
                                                                                >
                                                                                    <Box>
                                                                                        <Typography variant="body2">
                                                                                            {layout.displayName}
                                                                                        </Typography>
                                                                                        <Typography variant="caption" color="text.secondary">
                                                                                            {layout.layoutType}
                                                                                            {isFrameEngine && layout.isTemplate && " (Template)"}
                                                                                        </Typography>
                                                                                    </Box>
                                                                                </MenuItem>
                                                                            ))}
                                                                        </Select>
                                                                    </FormControl>
                                                                    {isConfigured && (
                                                                        <Chip
                                                                            size="small"
                                                                            label="Configured"
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
                                                            <TableCell sx={cellStyle}>
                                                                <TextField
                                                                    type="number"
                                                                    size="small"
                                                                    value={config?.targetPollRate || ""}
                                                                    onChange={(e) => handlePollRateChange(linkId, screenId, e.target.value)}
                                                                    placeholder="Optional"
                                                                    disabled={isLoading}
                                                                    sx={{ minWidth: 100 }}
                                                                />
                                                            </TableCell>
                                                            <TableCell sx={cellStyle}>
                                                                <FormControlLabel
                                                                    control={
                                                                        <Switch
                                                                            checked={config?.onlySendIfChanged ?? true}
                                                                            onChange={() => handleOnlySendIfChangedToggle(linkId, screenId)}
                                                                            disabled={isLoading}
                                                                            size="small"
                                                                        />
                                                                    }
                                                                    label=""
                                                                />
                                                            </TableCell>
                                                            {isFrameEngine && (
                                                                <TableCell sx={cellStyle}>
                                                                    <Box>
                                                                        <FormControlLabel
                                                                            control={
                                                                                <Switch
                                                                                    checked={config?.enableUrlAccess ?? false}
                                                                                    onChange={() => handleUrlAccessToggle(linkId, screenId)}
                                                                                    disabled={isLoading}
                                                                                    size="small"
                                                                                />
                                                                            }
                                                                            label="Enable URL Access"
                                                                        />
                                                                        {config?.enableUrlAccess && frameUrl && (
                                                                            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                                <LinkIcon fontSize="small" color="primary" />
                                                                                <Link
                                                                                    href={frameUrl}
                                                                                    target="_blank"
                                                                                    rel="noopener"
                                                                                    sx={{ fontSize: '0.75rem', wordBreak: 'break-all' }}
                                                                                >
                                                                                    {frameUrl}
                                                                                </Link>
                                                                                <Tooltip title="Copy URL">
                                                                                    <IconButton
                                                                                        size="small"
                                                                                        onClick={() => copyToClipboard(frameUrl)}
                                                                                        sx={{ ml: 1 }}
                                                                                    >
                                                                                        <ContentCopyIcon fontSize="small" />
                                                                                    </IconButton>
                                                                                </Tooltip>
                                                                            </Box>
                                                                        )}
                                                                    </Box>
                                                                </TableCell>
                                                            )}
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </Box>
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