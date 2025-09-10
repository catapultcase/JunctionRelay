// components/DashboardSettings.tsx
import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Card,
    CardContent,
    CardHeader,
    Collapse,
    IconButton,
    Tooltip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    SelectChangeEvent,
    Chip,
    Alert,
    Paper,
    Switch,
    FormControlLabel,
    Slider,
    Divider
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CloseIcon from '@mui/icons-material/Close';
import SettingsIcon from '@mui/icons-material/Settings';
import SpeedIcon from '@mui/icons-material/Speed';
import TuneIcon from '@mui/icons-material/Tune';
import AnimationIcon from '@mui/icons-material/Animation';
import { useDashboardWebSocket, POLL_RATE_PRESETS, POLL_RATE_LABELS } from '../hooks/useDashboardWebSocket';

interface DashboardSettingsProps {
    enabled: boolean; // True if either collectors or streams card is expanded
    defaultExpanded?: boolean;
    storageKey?: string;
    showDismissButton?: boolean; // Controls whether dismiss functionality is available
    showAsCard?: boolean; // Controls whether to render as Card or Paper
    showSnackbar?: (message: string, severity?: 'success' | 'error' | 'warning' | 'info') => void;
}

interface VisualizationSettings {
    bufferSize: number;
    scrollInterval: number;
    showLatencyMetrics: boolean;
    autoHideInactive: boolean;
    inactiveThreshold: number; // seconds
    enableTileFlashing: boolean; // NEW: Controls background color flashing
}

const DashboardSettings: React.FC<DashboardSettingsProps> = ({
    enabled,
    defaultExpanded = false,
    storageKey = 'dashboard_settings_expanded',
    showDismissButton = true,
    showAsCard = true,
    showSnackbar
}) => {
    // Check if component has been dismissed - only when dismiss button is enabled
    const [isDismissed, setIsDismissed] = useState<boolean>(() => {
        if (!showDismissButton) return false; // Never dismissed when dismiss button is disabled
        const dismissed = localStorage.getItem('dashboard_settings_dismissed');
        return dismissed === 'true'; // Default to dismissed to prevent flicker
    });

    const [expanded, setExpanded] = useState<boolean>(() => {
        const saved = localStorage.getItem(storageKey);
        return saved !== null ? saved === 'true' : defaultExpanded;
    });

    // WebSocket hook for connection management
    const {
        connectionStatus,
        isConnected,
        lastUpdate,
        setPollRate,
        currentPollRate
    } = useDashboardWebSocket({
        enabled: enabled
    });

    // Visualization settings with localStorage persistence
    const [visualSettings, setVisualSettings] = useState<VisualizationSettings>(() => {
        const saved = localStorage.getItem('dashboard_visualization_settings');
        return saved ? JSON.parse(saved) : {
            bufferSize: 400, // Minimum to fill display area
            scrollInterval: 30, // ms per scroll step
            showLatencyMetrics: true, // Default to true
            autoHideInactive: true, // Default to true
            inactiveThreshold: 30, // seconds
            enableTileFlashing: false // Default to false
        };
    });

    // Save settings to localStorage when they change
    useEffect(() => {
        localStorage.setItem('dashboard_visualization_settings', JSON.stringify(visualSettings));

        // Dispatch custom event to notify visualization components
        window.dispatchEvent(new CustomEvent('dashboard-settings-changed', {
            detail: visualSettings
        }));
    }, [visualSettings]);

    // Save expansion state
    useEffect(() => {
        localStorage.setItem(storageKey, expanded.toString());
    }, [expanded, storageKey]);

    // Save dismissed state - only when dismiss button is enabled
    useEffect(() => {
        if (showDismissButton) {
            localStorage.setItem('dashboard_settings_dismissed', isDismissed.toString());
        }
    }, [isDismissed, showDismissButton]);

    // Auto-collapse when WebSocket is disabled
    useEffect(() => {
        if (!enabled && expanded) {
            setExpanded(false);
        }
    }, [enabled, expanded]);

    const handleToggle = () => {
        setExpanded(!expanded);
    };

    const handleDismiss = () => {
        setIsDismissed(true);
        setExpanded(false); // Also collapse when dismissing
        if (showSnackbar) {
            showSnackbar('Dashboard Settings hidden. Available in Settings page.', 'info');
        }
    };

    const handlePollRateChange = (event: SelectChangeEvent<number>) => {
        const newRate = event.target.value as number;
        setPollRate(newRate);
    };

    const handleVisualizationChange = (setting: keyof VisualizationSettings, value: any) => {
        setVisualSettings(prev => ({
            ...prev,
            [setting]: value
        }));
    };

    const formatLastUpdate = (timestamp: number) => {
        if (!timestamp) return 'Never';
        const now = Date.now();
        const diff = now - timestamp;
        if (diff < 1000) return 'Just now';
        if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
        return new Date(timestamp).toLocaleTimeString();
    };

    const getPerformanceWarning = (rate: number) => {
        if (rate <= 50) {
            return {
                severity: 'warning' as const,
                message: 'Very high refresh rate may impact performance and battery life. Consider reducing visualization buffer size.'
            };
        }
        if (rate <= 100) {
            return {
                severity: 'info' as const,
                message: 'High refresh rate provides smooth updates but uses more resources.'
            };
        }
        return null;
    };

    const getScrollIntervalImpact = () => {
        const scrollFPS = Math.round(1000 / visualSettings.scrollInterval);
        const pollFPS = Math.round(1000 / currentPollRate);

        if (scrollFPS > pollFPS * 2) {
            return {
                severity: 'warning' as const,
                message: `Scroll rate (${scrollFPS} FPS) is much higher than data rate (${pollFPS} FPS). Consider matching scroll interval to poll rate.`
            };
        }
        return null;
    };

    const performanceWarning = getPerformanceWarning(currentPollRate);
    const scrollWarning = getScrollIntervalImpact();

    // Don't render if WebSocket is not enabled OR if component has been dismissed (only when dismiss is enabled)
    if (!enabled || (showDismissButton && isDismissed)) {
        return null;
    }

    return showAsCard ? (
        <Card sx={{ mb: 3 }}>
            <CardHeader
                title={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <SettingsIcon color="primary" />
                        <Typography variant="h6">
                            Dashboard Settings
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            WebSocket & Visualization Configuration
                        </Typography>
                    </Box>
                }
                action={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {expanded && (
                            <Chip
                                label={connectionStatus}
                                color={isConnected ? 'success' : 'error'}
                                size="small"
                            />
                        )}
                        <Tooltip title={expanded ? "Hide Settings" : "Show Settings"}>
                            <IconButton onClick={handleToggle} size="small">
                                {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                        </Tooltip>
                        {showDismissButton && (
                            <Tooltip title="Dismiss (available in Settings page)">
                                <IconButton onClick={handleDismiss} size="small" color="inherit">
                                    <CloseIcon />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                }
                sx={{
                    cursor: 'pointer',
                    pb: expanded ? 1 : 2,
                    '&:hover': { backgroundColor: 'action.hover' }
                }}
                onClick={handleToggle}
            />
            <Collapse in={expanded}>
                {expanded && renderContent()}
            </Collapse>
        </Card>
    ) : (
        <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <SettingsIcon color="primary" />
                    <Typography variant="h6">
                        Dashboard Settings
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        WebSocket & Visualization Configuration
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                        label={connectionStatus}
                        color={isConnected ? 'success' : 'error'}
                        size="small"
                    />
                </Box>
            </Box>
            {renderContent()}
        </Paper>
    );

    function renderContent() {
        return (
            <CardContent sx={{ pt: 0 }}>
                <Box sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', md: 'row' },
                    gap: 3
                }}>
                    {/* WebSocket Configuration */}
                    <Box sx={{ flex: 1 }}>
                        <Paper sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <SpeedIcon color="primary" />
                                <Typography variant="subtitle1">
                                    WebSocket Configuration
                                </Typography>
                            </Box>

                            {/* Connection Status */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Typography variant="body2" color="text.secondary">
                                    Status:
                                </Typography>
                                <Chip
                                    label={connectionStatus}
                                    color={isConnected ? 'success' : 'error'}
                                    size="small"
                                />
                                <Typography variant="body2" color="text.secondary">
                                    Last update: {formatLastUpdate(lastUpdate)}
                                </Typography>
                            </Box>

                            {/* Poll Rate Setting */}
                            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                                <InputLabel>Data Refresh Rate</InputLabel>
                                <Select
                                    value={currentPollRate}
                                    onChange={handlePollRateChange}
                                    label="Data Refresh Rate"
                                >
                                    {Object.entries(POLL_RATE_PRESETS).map(([key, value]) => (
                                        <MenuItem key={key} value={value}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                <span>{POLL_RATE_LABELS[value]}</span>
                                                <Chip
                                                    label={`${Math.round(1000 / value)} FPS`}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ ml: 1 }}
                                                />
                                            </Box>
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            {/* Performance Warnings */}
                            {performanceWarning && (
                                <Alert severity={performanceWarning.severity} sx={{ fontSize: '0.875rem', mb: 2 }}>
                                    {performanceWarning.message}
                                </Alert>
                            )}

                            {/* Rate Information */}
                            <Box sx={{
                                p: 1.5,
                                bgcolor: 'background.default',
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider'
                            }}>
                                <Typography variant="caption" color="text.secondary" display="block">
                                    Current: {currentPollRate}ms interval ({Math.round(1000 / currentPollRate)} updates/sec)
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                    💡 Lower values = more frequent data updates but higher resource usage
                                </Typography>
                            </Box>
                        </Paper>
                    </Box>

                    {/* Visualization Configuration */}
                    <Box sx={{ flex: 1 }}>
                        <Paper sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <TuneIcon color="primary" />
                                <Typography variant="subtitle1">
                                    Visualization Settings
                                </Typography>
                            </Box>

                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, px: 2 }}>
                                {/* Scroll Interval Slider */}
                                <Box>
                                    <Typography variant="body2" gutterBottom>
                                        Scroll Smoothness: {visualSettings.scrollInterval}ms
                                        ({Math.round(1000 / visualSettings.scrollInterval)} FPS)
                                    </Typography>
                                    <Slider
                                        value={visualSettings.scrollInterval}
                                        onChange={(_, value) => handleVisualizationChange('scrollInterval', value)}
                                        min={16} // ~60 FPS max
                                        max={100} // ~10 FPS min
                                        step={1}
                                        marks={[
                                            { value: 16, label: '60 FPS' },
                                            { value: 33, label: '30 FPS' },
                                            { value: 50, label: '20 FPS' },
                                            { value: 100, label: '10 FPS' }
                                        ]}
                                        size="small"
                                    />
                                </Box>

                                {/* Buffer Size Slider */}
                                <Box>
                                    <Typography variant="body2" gutterBottom>
                                        Data Buffer Size: {visualSettings.bufferSize} points
                                    </Typography>
                                    <Slider
                                        value={visualSettings.bufferSize}
                                        onChange={(_, value) => handleVisualizationChange('bufferSize', value)}
                                        min={400} // Minimum to fill display
                                        max={1200} // Maximum for performance
                                        step={50}
                                        marks={[
                                            { value: 400, label: '400' },
                                            { value: 600, label: '600' },
                                            { value: 800, label: '800' },
                                            { value: 1000, label: '1000' },
                                            { value: 1200, label: '1200' }
                                        ]}
                                        size="small"
                                    />
                                </Box>

                                {/* Latency Metrics Toggle */}
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={visualSettings.showLatencyMetrics}
                                            onChange={(e) => handleVisualizationChange('showLatencyMetrics', e.target.checked)}
                                            color="primary"
                                        />
                                    }
                                    label="Show Latency Metrics"
                                />

                                {/* Tile Flashing Toggle */}
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={visualSettings.enableTileFlashing}
                                            onChange={(e) => handleVisualizationChange('enableTileFlashing', e.target.checked)}
                                            color="primary"
                                        />
                                    }
                                    label="Enable Tile Flashing on Data"
                                />

                                {/* Auto-hide Inactive Toggle */}
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={visualSettings.autoHideInactive}
                                            onChange={(e) => handleVisualizationChange('autoHideInactive', e.target.checked)}
                                            color="primary"
                                        />
                                    }
                                    label="Auto-hide Inactive Components"
                                />

                                {visualSettings.autoHideInactive && (
                                    <Box sx={{ ml: 4, px: 2 }}>
                                        <Typography variant="body2" gutterBottom>
                                            Hide after: {visualSettings.inactiveThreshold}s of inactivity
                                        </Typography>
                                        <Slider
                                            value={visualSettings.inactiveThreshold}
                                            onChange={(_, value) => handleVisualizationChange('inactiveThreshold', value)}
                                            min={10}
                                            max={300}
                                            step={10}
                                            size="small"
                                        />
                                    </Box>
                                )}
                            </Box>

                            {/* Scroll Warning */}
                            {scrollWarning && (
                                <Alert severity={scrollWarning.severity} sx={{ fontSize: '0.875rem', mt: 2 }}>
                                    {scrollWarning.message}
                                </Alert>
                            )}

                            <Divider sx={{ my: 2 }} />

                            {/* Impact Information */}
                            <Box sx={{
                                p: 1.5,
                                bgcolor: 'background.default',
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider'
                            }}>
                                <Typography variant="caption" color="text.secondary" display="block">
                                    💡 WebSocket poll rate affects how often new data arrives
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block">
                                    🎨 Scroll interval affects animation smoothness
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block">
                                    📊 Buffer size affects how much history is visible
                                </Typography>
                                <Typography variant="caption" color="text.secondary" display="block">
                                    ✨ Tile flashing provides visual feedback when data updates
                                </Typography>
                            </Box>
                        </Paper>
                    </Box>
                </Box>

                {/* Dismiss hint - only show when dismiss button is enabled */}
                {showDismissButton && (
                    <Alert severity="info" sx={{ mt: 2, fontSize: '0.875rem' }}>
                        💡 You can dismiss this panel using the × button. These settings will still be available in the Settings page.
                    </Alert>
                )}
            </CardContent>
        );
    }
};

export default DashboardSettings;