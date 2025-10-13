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

import React, { useState, useEffect, useMemo } from 'react';
import {
    Box,
    Typography,
    Paper,
    Chip,
    Alert,
    Card,
    CardContent,
    CardHeader,
    Collapse,
    IconButton,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Checkbox,
    ListItemText,
    SelectChangeEvent,
    Button,
    Tooltip,
    Slider,
    FormControlLabel,
    Switch
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SettingsIcon from '@mui/icons-material/Settings';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import DeselectIcon from '@mui/icons-material/Deselect';
import StreamIcon from '@mui/icons-material/Stream';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import { useDashboardWebSocket } from '../../hooks/useDashboardWebSocket';
import ECGStreamVisualizationHTTP from './Dashboard_ECGStreamVisualizationHTTP';
import ECGStreamVisualizationMQTT from './Dashboard_ECGStreamVisualizationMQTT';

interface ActiveStreamsCardProps {
    defaultExpanded?: boolean;
    storageKey?: string;
}

// Streamlined interface with only the properties we actually need
interface StreamData {
    streamKey?: string | number;
    screenId?: number;
    protocol?: string;
    deviceName?: string;
    deviceMac?: string; // Added for WebSocket streams
    screenName?: string;
    status?: string;
    sensorsCount?: number;
    rate?: number;
    latency?: number;
    lastSentTime?: string;
    // WebSocket-specific properties
    isGatewayMode?: boolean;
    gatewayTarget?: string;
    compressionEnabled?: boolean;
    health?: {
        connectionState?: string;
        successRate?: number;
        lastErrorMessage?: string;
        errorType?: string;
        consecutiveFailures?: number;
        consecutiveSuccesses?: number;
        averageLatency?: number;
        maxLatency?: number;
        minLatency?: number;
        lastSuccessTime?: string;
        lastFailureTime?: string;
        // Protocol-specific health properties
        httpStatusCode?: number;
        acknowledgmentTimeouts?: number;
        publishFailures?: number;
        // WebSocket-specific health properties
        connectionRecreated?: boolean;
        lastWebSocketState?: string;
        connectionRecreationCount?: number;
        isFrameMode?: boolean;
        payloadType?: string;
        framesSent?: number;
        payloadsSent?: number;
        currentFrameLayoutType?: string;
        averageFrameSize?: number;
        maxFrameSize?: number;
        minFrameSize?: number;
        averageFrameRenderTime?: number;
        maxFrameRenderTime?: number;
        minFrameRenderTime?: number;
        isGatewayMode?: boolean;
        gatewayTarget?: string;
        gatewayMessagesSent?: number;
    };
}

const ActiveStreamsCard: React.FC<ActiveStreamsCardProps> = ({
    defaultExpanded = true,
    storageKey = 'active_streams_expanded'
}) => {
    const [expanded, setExpanded] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem(storageKey);
            return saved !== null ? saved === 'true' : defaultExpanded;
        } catch {
            return defaultExpanded;
        }
    });

    const [showStreamSelect, setShowStreamSelect] = useState<boolean>(false);
    const [selectedStreams, setSelectedStreams] = useState<string[]>(() => {
        try {
            const saved = localStorage.getItem(`${storageKey}_selected`);
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    });

    // ECG width control with localStorage persistence
    const [ecgWidth, setEcgWidth] = useState<number>(() => {
        const saved = localStorage.getItem(`${storageKey}_ecg_width`);
        return saved ? parseInt(saved, 10) : 400; // Default to current size
    });

    // NEW: Group by protocol toggle with localStorage persistence
    const [groupByProtocol, setGroupByProtocol] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem(`${storageKey}_group_by_protocol`);
            return saved !== null ? saved === 'true' : true; // Default to true
        } catch {
            return true;
        }
    });

    // WebSocket connection
    const {
        streams,
        connectionStatus,
        isConnected,
        connect,
        disconnect
    } = useDashboardWebSocket({
        enabled: expanded
    });

    // Process streams from WebSocket data
    const availableStreams = useMemo(() => {
        if (!streams || !Array.isArray(streams)) {
            return [];
        }

        return streams.map((stream: StreamData, index: number) => {
            const key = String(stream.streamKey ?? stream.screenId ?? `stream-${index}`);
            const deviceName = stream.deviceName || 'Unknown Device';
            const screenName = stream.screenName || 'Unknown Screen';
            const name = `${deviceName} - ${screenName}`;

            return {
                key,
                name,
                stream: {
                    streamKey: stream.streamKey ?? key,
                    protocol: stream.protocol || 'HTTP',
                    deviceName,
                    deviceMac: stream.deviceMac || '',
                    screenName,
                    status: stream.status || 'Unknown',
                    sensorsCount: stream.sensorsCount || 0,
                    rate: stream.rate || 1000,
                    latency: stream.latency || 0,
                    lastSentTime: stream.lastSentTime || '',
                    isGatewayMode: stream.isGatewayMode || false,
                    gatewayTarget: stream.gatewayTarget || '',
                    compressionEnabled: stream.compressionEnabled || false,
                    health: stream.health || {
                        connectionState: 'unknown',
                        successRate: 0,
                        lastErrorMessage: '',
                        errorType: '',
                        consecutiveFailures: 0,
                        consecutiveSuccesses: 0,
                        averageLatency: 0,
                        maxLatency: 0,
                        minLatency: 0,
                        lastSuccessTime: '',
                        lastFailureTime: ''
                    }
                }
            };
        });
    }, [streams]);

    // Auto-select new streams
    useEffect(() => {
        if (availableStreams.length > 0) {
            setSelectedStreams(prev => {
                const currentKeys = availableStreams.map(s => s.key);
                if (prev.length === 0) {
                    return currentKeys;
                }
                const newKeys = currentKeys.filter(key => !prev.includes(key));
                if (newKeys.length > 0) {
                    return [...prev, ...newKeys];
                }
                return prev.filter(key => currentKeys.includes(key));
            });
        }
    }, [availableStreams]);

    // Save states to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(storageKey, expanded.toString());
        } catch {
            // Ignore localStorage errors
        }
    }, [expanded, storageKey]);

    useEffect(() => {
        try {
            localStorage.setItem(`${storageKey}_selected`, JSON.stringify(selectedStreams));
        } catch {
            // Ignore localStorage errors
        }
    }, [selectedStreams, storageKey]);

    // Save ECG width to localStorage
    useEffect(() => {
        localStorage.setItem(`${storageKey}_ecg_width`, ecgWidth.toString());
    }, [ecgWidth, storageKey]);

    // NEW: Save group by protocol setting to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(`${storageKey}_group_by_protocol`, groupByProtocol.toString());
        } catch {
            // Ignore localStorage errors
        }
    }, [groupByProtocol, storageKey]);

    // Handle WebSocket connection based on expansion state
    useEffect(() => {
        if (expanded) {
            if (!isConnected && typeof connect === 'function') {
                connect();
            }
        }
        // Removed the disconnect when collapsed - let it stay connected
        // Only disconnect on component unmount
    }, [expanded, isConnected, connect]);

    // Separate effect for unmount cleanup only
    useEffect(() => {
        return () => {
            if (typeof disconnect === 'function') {
                disconnect();
            }
        };
    }, [disconnect]);

    const handleToggle = () => {
        setExpanded(!expanded);
        if (expanded) {
            setShowStreamSelect(false);
        }
    };

    const handleStreamSelectToggle = (event: React.MouseEvent) => {
        event.stopPropagation();
        setShowStreamSelect(!showStreamSelect);
    };

    const handleStreamSelectionChange = (event: SelectChangeEvent<string[]>) => {
        const value = event.target.value;
        setSelectedStreams(typeof value === 'string' ? value.split(',') : value);
    };

    const handleSelectAll = () => {
        setSelectedStreams(availableStreams.map(s => s.key));
    };

    const handleDeselectAll = () => {
        setSelectedStreams([]);
    };

    // Handle ECG width change
    const handleEcgWidthChange = (event: Event, newValue: number | number[]) => {
        setEcgWidth(newValue as number);
    };

    // NEW: Handle group by protocol toggle
    const handleGroupByProtocolChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setGroupByProtocol(event.target.checked);
    };

    // Filter streams based on selection
    const displayedStreams = useMemo(() => {
        return availableStreams.filter(item => selectedStreams.includes(item.key));
    }, [availableStreams, selectedStreams]);

    // Group streams by protocol
    const groupedStreams = useMemo(() => {
        const httpStreams = displayedStreams.filter(item => {
            const protocol = item.stream.protocol?.toLowerCase() || '';
            return protocol.includes('http');
        });

        const mqttStreams = displayedStreams.filter(item => {
            const protocol = item.stream.protocol?.toLowerCase() || '';
            return protocol.includes('mqtt');
        });

        const comStreams = displayedStreams.filter(item => {
            const protocol = item.stream.protocol?.toLowerCase() || '';
            return protocol.includes('com');
        });

        const webSocketStreams = displayedStreams.filter(item => {
            const protocol = item.stream.protocol?.toLowerCase() || '';
            return protocol.includes('websocket');
        });

        const virtualStreams = displayedStreams.filter(item => {
            const protocol = item.stream.protocol?.toLowerCase() || '';
            return protocol.includes('virtual');
        });

        const otherStreams = displayedStreams.filter(item => {
            const protocol = item.stream.protocol?.toLowerCase() || '';
            return !protocol.includes('http') &&
                !protocol.includes('mqtt') &&
                !protocol.includes('com') &&
                !protocol.includes('websocket') &&
                !protocol.includes('virtual');
        });

        return { httpStreams, mqttStreams, comStreams, webSocketStreams, virtualStreams, otherStreams };
    }, [displayedStreams]);

    // Render the appropriate visualization component
    const renderStreamVisualization = (item: { key: string; name: string; stream: any }) => {
        const protocol = item.stream.protocol?.toLowerCase() || '';

        if (protocol.includes('mqtt')) {
            return (
                <ECGStreamVisualizationMQTT
                    key={item.key}
                    stream={item.stream}
                    width={ecgWidth} // Use dynamic width
                    height={120}
                />
            );
        } else if (protocol.includes('websocket')) {
            // Use HTTP visualization for WebSocket streams (they have similar structure)
            // You could create a dedicated ECGStreamVisualizationWebSocket component if needed
            return (
                <ECGStreamVisualizationHTTP
                    key={item.key}
                    stream={item.stream}
                    width={ecgWidth} // Use dynamic width
                    height={120}
                />
            );
        } else {
            // Use HTTP visualization for HTTP, COM, Virtual, and unknown protocols
            return (
                <ECGStreamVisualizationHTTP
                    key={item.key}
                    stream={item.stream}
                    width={ecgWidth} // Use dynamic width
                    height={120}
                />
            );
        }
    };

    const renderStreamSelect = () => (
        <Box>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Display Streams</InputLabel>
                <Select
                    multiple
                    value={selectedStreams}
                    onChange={handleStreamSelectionChange}
                    label="Display Streams"
                    MenuProps={{
                        PaperProps: {
                            style: {
                                maxHeight: 300
                            }
                        }
                    }}
                    renderValue={(selected) => (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {selected.map((key) => {
                                const stream = availableStreams.find(s => s.key === key);
                                const protocol = stream?.stream?.protocol || 'Unknown';
                                return (
                                    <Chip
                                        key={key}
                                        label={`${stream?.name || key} (${protocol})`}
                                        size="small"
                                    />
                                );
                            })}
                        </Box>
                    )}
                >
                    {availableStreams.map((item) => (
                        <MenuItem key={item.key} value={item.key}>
                            <Checkbox checked={selectedStreams.includes(item.key)} />
                            <ListItemText
                                primary={item.name}
                                secondary={`Protocol: ${item.stream.protocol || 'Unknown'} | Status: ${item.stream.status || 'Unknown'}`}
                            />
                        </MenuItem>
                    ))}
                </Select>

                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button
                        size="small"
                        onClick={handleSelectAll}
                        startIcon={<SelectAllIcon />}
                        disabled={selectedStreams.length === availableStreams.length}
                    >
                        Select All
                    </Button>
                    <Button
                        size="small"
                        onClick={handleDeselectAll}
                        startIcon={<DeselectIcon />}
                        disabled={selectedStreams.length === 0}
                    >
                        Deselect All
                    </Button>
                </Box>
            </FormControl>

            {/* NEW: Group by Protocol Toggle */}
            <Box sx={{ mt: 3, mb: 3 }}>
                <FormControlLabel
                    control={
                        <Switch
                            checked={groupByProtocol}
                            onChange={handleGroupByProtocolChange}
                            color="primary"
                        />
                    }
                    label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <GroupWorkIcon color="primary" fontSize="small" />
                            <Typography variant="subtitle2">
                                Group by Protocol
                            </Typography>
                        </Box>
                    }
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    When enabled, streams are organized by protocol type. When disabled, all streams are shown in a single section.
                </Typography>
            </Box>

            {/* ECG Width Control (matching collector card style) */}
            <Box sx={{ mt: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <AspectRatioIcon color="primary" fontSize="small" />
                    <Typography variant="subtitle2">
                        ECG Width: {ecgWidth}px
                    </Typography>
                </Box>
                <Box sx={{ px: 2, maxWidth: 300 }}>
                    <Slider
                        value={ecgWidth}
                        onChange={handleEcgWidthChange}
                        min={200}
                        max={800}
                        step={50}
                        marks={[
                            { value: 200, label: '200' },
                            { value: 400, label: '400' },
                            { value: 600, label: '600' },
                            { value: 800, label: '800' }
                        ]}
                        size="small"
                        sx={{ mb: 1 }}
                    />
                </Box>
                <Typography variant="caption" color="text.secondary">
                    Adjust visualization width (saved automatically)
                </Typography>
            </Box>
        </Box>
    );

    return (
        <Card sx={{ mb: 4, borderRadius: 2 }}>
            <CardHeader
                title={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <StreamIcon color="primary" />
                        <Typography variant="h6">
                            Active Streams
                        </Typography>
                        {expanded && (
                            <>
                                <Chip
                                    label={connectionStatus}
                                    color={isConnected ? 'success' : 'error'}
                                    size="small"
                                />
                                {availableStreams.length > 0 && (
                                    <Chip
                                        label={`${displayedStreams.length}/${availableStreams.length} shown`}
                                        size="small"
                                        variant="outlined"
                                    />
                                )}
                                {/* Width indicator chip */}
                                {displayedStreams.length > 0 && (
                                    <Chip
                                        label={`${ecgWidth}px wide`}
                                        size="small"
                                        variant="outlined"
                                        color="secondary"
                                    />
                                )}
                                {/* Protocol breakdown (only show when grouping is enabled) */}
                                {displayedStreams.length > 0 && groupByProtocol && (
                                    <>
                                        {groupedStreams.httpStreams.length > 0 && (
                                            <Chip
                                                label={`${groupedStreams.httpStreams.length} HTTP`}
                                                size="small"
                                                sx={{ bgcolor: '#2196f3', color: 'white' }}
                                            />
                                        )}
                                        {groupedStreams.mqttStreams.length > 0 && (
                                            <Chip
                                                label={`${groupedStreams.mqttStreams.length} MQTT`}
                                                size="small"
                                                sx={{ bgcolor: '#9c27b0', color: 'white' }}
                                            />
                                        )}
                                        {groupedStreams.comStreams.length > 0 && (
                                            <Chip
                                                label={`${groupedStreams.comStreams.length} COM`}
                                                size="small"
                                                sx={{ bgcolor: '#4caf50', color: 'white' }}
                                            />
                                        )}
                                        {groupedStreams.webSocketStreams.length > 0 && (
                                            <Chip
                                                label={`${groupedStreams.webSocketStreams.length} WebSocket`}
                                                size="small"
                                                sx={{ bgcolor: '#ff9800', color: 'white' }}
                                            />
                                        )}
                                        {groupedStreams.virtualStreams.length > 0 && (
                                            <Chip
                                                label={`${groupedStreams.virtualStreams.length} Virtual`}
                                                size="small"
                                                sx={{ bgcolor: '#795548', color: 'white' }}
                                            />
                                        )}
                                        {groupedStreams.otherStreams.length > 0 && (
                                            <Chip
                                                label={`${groupedStreams.otherStreams.length} Other`}
                                                size="small"
                                                sx={{ bgcolor: '#607d8b', color: 'white' }}
                                            />
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </Box>
                }
                action={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {expanded && (
                            <Tooltip title="Stream Settings">
                                <IconButton
                                    onClick={handleStreamSelectToggle}
                                    size="small"
                                    color={showStreamSelect ? 'primary' : 'default'}
                                >
                                    <SettingsIcon />
                                </IconButton>
                            </Tooltip>
                        )}
                        <IconButton onClick={handleToggle} size="small">
                            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
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
                {expanded && (
                    <CardContent sx={{ pt: 0 }}>
                        {!isConnected && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                WebSocket not connected. Connection status: {connectionStatus}
                            </Alert>
                        )}

                        {/* Stream Selection Panel */}
                        <Collapse in={showStreamSelect}>
                            {showStreamSelect && (
                                <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}>
                                    <Typography variant="subtitle2" gutterBottom>
                                        Stream Display Settings
                                    </Typography>
                                    {renderStreamSelect()}
                                </Paper>
                            )}
                        </Collapse>

                        {/* Content */}
                        {availableStreams.length === 0 ? (
                            <Paper sx={{ p: 3, textAlign: 'center' }}>
                                <Typography color="text.secondary">
                                    {isConnected ? 'No active streams found' : 'Waiting for connection...'}
                                </Typography>
                            </Paper>
                        ) : displayedStreams.length === 0 ? (
                            <Paper sx={{ p: 3, textAlign: 'center' }}>
                                <Typography color="text.secondary">
                                    No streams selected for display. Use the settings to select streams.
                                </Typography>
                                <Button
                                    onClick={handleSelectAll}
                                    sx={{ mt: 1 }}
                                    startIcon={<SelectAllIcon />}
                                >
                                    Show All Streams
                                </Button>
                            </Paper>
                        ) : groupByProtocol ? (
                            <>
                                {/* HTTP Streams Section */}
                                {groupedStreams.httpStreams.length > 0 && (
                                    <Box sx={{ mb: 3 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 2, color: '#2196f3', fontWeight: 'bold' }}>
                                            HTTP Streams ({groupedStreams.httpStreams.length})
                                        </Typography>
                                        <Box sx={{
                                            display: 'grid',
                                            gap: 2,
                                            gridTemplateColumns: `repeat(auto-fit, ${ecgWidth}px)`, // Dynamic grid based on width
                                            width: '100%'
                                        }}>
                                            {groupedStreams.httpStreams.map(renderStreamVisualization)}
                                        </Box>
                                    </Box>
                                )}

                                {/* MQTT Streams Section */}
                                {groupedStreams.mqttStreams.length > 0 && (
                                    <Box sx={{ mb: 3 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 2, color: '#9c27b0', fontWeight: 'bold' }}>
                                            MQTT Streams ({groupedStreams.mqttStreams.length})
                                        </Typography>
                                        <Box sx={{
                                            display: 'grid',
                                            gap: 2,
                                            gridTemplateColumns: `repeat(auto-fit, ${ecgWidth}px)`, // Dynamic grid based on width
                                            width: '100%'
                                        }}>
                                            {groupedStreams.mqttStreams.map(renderStreamVisualization)}
                                        </Box>
                                    </Box>
                                )}

                                {/* COM Streams Section */}
                                {groupedStreams.comStreams.length > 0 && (
                                    <Box sx={{ mb: 3 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 2, color: '#4caf50', fontWeight: 'bold' }}>
                                            COM Streams ({groupedStreams.comStreams.length})
                                        </Typography>
                                        <Box sx={{
                                            display: 'grid',
                                            gap: 2,
                                            gridTemplateColumns: `repeat(auto-fit, ${ecgWidth}px)`, // Dynamic grid based on width
                                            width: '100%'
                                        }}>
                                            {groupedStreams.comStreams.map(renderStreamVisualization)}
                                        </Box>
                                    </Box>
                                )}

                                {/* WebSocket Streams Section */}
                                {groupedStreams.webSocketStreams.length > 0 && (
                                    <Box sx={{ mb: 3 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 2, color: '#ff9800', fontWeight: 'bold' }}>
                                            WebSocket Streams ({groupedStreams.webSocketStreams.length})
                                        </Typography>
                                        <Box sx={{
                                            display: 'grid',
                                            gap: 2,
                                            gridTemplateColumns: `repeat(auto-fit, ${ecgWidth}px)`, // Dynamic grid based on width
                                            width: '100%'
                                        }}>
                                            {groupedStreams.webSocketStreams.map(renderStreamVisualization)}
                                        </Box>
                                    </Box>
                                )}

                                {/* Virtual Streams Section */}
                                {groupedStreams.virtualStreams.length > 0 && (
                                    <Box sx={{ mb: 3 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 2, color: '#795548', fontWeight: 'bold' }}>
                                            Virtual Streams ({groupedStreams.virtualStreams.length})
                                        </Typography>
                                        <Box sx={{
                                            display: 'grid',
                                            gap: 2,
                                            gridTemplateColumns: `repeat(auto-fit, ${ecgWidth}px)`, // Dynamic grid based on width
                                            width: '100%'
                                        }}>
                                            {groupedStreams.virtualStreams.map(renderStreamVisualization)}
                                        </Box>
                                    </Box>
                                )}

                                {/* Other Streams Section */}
                                {groupedStreams.otherStreams.length > 0 && (
                                    <Box sx={{ mb: 3 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 2, color: '#607d8b', fontWeight: 'bold' }}>
                                            Other Streams ({groupedStreams.otherStreams.length})
                                        </Typography>
                                        <Box sx={{
                                            display: 'grid',
                                            gap: 2,
                                            gridTemplateColumns: `repeat(auto-fit, ${ecgWidth}px)`, // Dynamic grid based on width
                                            width: '100%'
                                        }}>
                                            {groupedStreams.otherStreams.map(renderStreamVisualization)}
                                        </Box>
                                    </Box>
                                )}
                            </>
                        ) : (
                            // Single section view (when groupByProtocol is false)
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                                    All Streams ({displayedStreams.length})
                                </Typography>
                                <Box sx={{
                                    display: 'grid',
                                    gap: 2,
                                    gridTemplateColumns: `repeat(auto-fit, ${ecgWidth}px)`, // Dynamic grid based on width
                                    width: '100%'
                                }}>
                                    {displayedStreams.map(renderStreamVisualization)}
                                </Box>
                            </Box>
                        )}
                    </CardContent>
                )}
            </Collapse>
        </Card>
    );
};

export default ActiveStreamsCard;